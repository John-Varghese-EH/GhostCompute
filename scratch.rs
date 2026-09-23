    let req_id = uuid::Uuid::new_v4().to_string();
    let mut proxy_req = HttpProxyRequest {
        action: "http_proxy".to_string(),
        req_id: req_id.clone(),
        method: method.clone(),
        path: path.to_string(),
        headers: headers.clone(),
        body_base64: body_base64.clone(),
    };

    let settings = state.settings.lock().await.get();

    if path == "/v1/models" {
        let mut aggregated_models = Vec::new();
        
        // Add cloud models if keys are present
        if settings.gemini_api_key.is_some() {
            aggregated_models.push(serde_json::json!({"id": "gemini-1.5-pro", "object": "model", "created": 1, "owned_by": "google"}));
            aggregated_models.push(serde_json::json!({"id": "gemini-1.5-flash", "object": "model", "created": 1, "owned_by": "google"}));
        }
        if settings.groq_api_key.is_some() {
            aggregated_models.push(serde_json::json!({"id": "groq:llama3-8b-8192", "object": "model", "created": 1, "owned_by": "groq"}));
            aggregated_models.push(serde_json::json!({"id": "groq:llama3-70b-8192", "object": "model", "created": 1, "owned_by": "groq"}));
            aggregated_models.push(serde_json::json!({"id": "groq:mixtral-8x7b-32768", "object": "model", "created": 1, "owned_by": "groq"}));
        }

        let mut is_connected = false;
        {
            let client_state = state.p2p_client.lock().await;
            if let crate::client::ConnectionStatus::Connected { .. } = client_state.status() {
                is_connected = true;
            }
        }

        if is_connected {
            let rx = {
                let mut client_state = state.p2p_client.lock().await;
                client_state.proxy_http_request(proxy_req.clone()).await
            };
            if let Ok(mut rx) = rx {
                // Wait for the response to gather local models
                if let Some(val) = rx.recv().await {
                    if let Ok(chunk) = serde_json::from_value::<HttpProxyResponseChunk>(val) {
                        if let Some(b64) = chunk.data_base64 {
                            if let Ok(bytes) = BASE64.decode(b64) {
                                if let Ok(mut json) = serde_json::from_slice::<serde_json::Value>(&bytes) {
                                    if let Some(data) = json.get_mut("data").and_then(|d| d.as_array_mut()) {
                                        aggregated_models.append(data);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        let final_json = serde_json::json!({
            "object": "list",
            "data": aggregated_models
        });
        
        let mut response_headers = HeaderMap::new();
        response_headers.insert(axum::http::header::CONTENT_TYPE, HeaderValue::from_static("application/json"));
        return (
            StatusCode::OK,
            response_headers,
            axum::response::Json(final_json).to_string()
        ).into_response();
    }
    
    // Cloud AI Gateway routing for chat completions
    if path == "/v1/chat/completions" || path == "/api/chat" || path == "/api/generate" {
        if let Some(ref b64) = proxy_req.body_base64 {
            if let Ok(bytes) = BASE64.decode(b64) {
                if let Ok(mut json) = serde_json::from_slice::<serde_json::Value>(&bytes) {
                    if let Some(model) = json.get("model").and_then(|m| m.as_str()).map(|s| s.to_string()) {
                        let mut target_url: Option<String> = None;
                        let mut auth_header: Option<String> = None;
                        
                        if model.starts_with("gemini") && settings.gemini_api_key.is_some() {
                            target_url = Some("https://generativelanguage.googleapis.com/v1beta/openai/v1/chat/completions".to_string());
                            auth_header = Some(format!("Bearer {}", settings.gemini_api_key.as_ref().unwrap()));
                        } else if (model.starts_with("groq:") || model.contains("llama3") || model.contains("mixtral") || model.contains("gemma")) && settings.groq_api_key.is_some() {
                            target_url = Some("https://api.groq.com/openai/v1/chat/completions".to_string());
                            auth_header = Some(format!("Bearer {}", settings.groq_api_key.as_ref().unwrap()));
                            if model.starts_with("groq:") {
                                if let Some(obj) = json.as_object_mut() {
                                    let new_model = model.replace("groq:", "");
                                    obj.insert("model".to_string(), serde_json::json!(new_model));
                                    let modified_bytes = serde_json::to_vec(&json).unwrap();
                                    proxy_req.body_base64 = Some(BASE64.encode(&modified_bytes));
                                }
                            }
                        }
                        
                        if let (Some(url), Some(auth)) = (target_url, auth_header) {
                            let client = reqwest::Client::new();
                            let mut req_builder = client.request(
                                reqwest::Method::from_bytes(proxy_req.method.as_bytes()).unwrap_or(reqwest::Method::POST),
                                &url
                            );
                            for (k, v) in &proxy_req.headers {
                                if k.to_lowercase() != "host" {
                                    req_builder = req_builder.header(k, v);
                                }
                            }
                            req_builder = req_builder.header("Authorization", auth);
                            if let Some(ref b64) = proxy_req.body_base64 {
                                if let Ok(bytes) = BASE64.decode(b64) {
                                    req_builder = req_builder.body(bytes);
                                }
                            }
                            
                            match req_builder.send().await {
                                Ok(mut res) => {
                                    let status_code = StatusCode::from_u16(res.status().as_u16()).unwrap_or(StatusCode::OK);
                                    let mut response_headers = HeaderMap::new();
                                    for (name, value) in res.headers() {
                                        if let Ok(name) = HeaderName::from_bytes(name.as_str().as_bytes()) {
                                            if let Ok(val) = HeaderValue::from_bytes(value.as_bytes()) {
                                                response_headers.insert(name, val);
                                            }
                                        }
                                    }
                                    
                                    let (tx, body_rx) = tokio::sync::mpsc::channel::<Result<axum::body::Bytes, std::io::Error>>(100);
                                    tokio::spawn(async move {
                                        while let Ok(Some(chunk)) = res.chunk().await {
                                            if tx.send(Ok(chunk.into())).await.is_err() {
                                                break;
                                            }
                                        }
                                    });
                                    let stream = tokio_stream::wrappers::ReceiverStream::new(body_rx);
                                    let body = Body::from_stream(stream);
                                    return (status_code, response_headers, body).into_response();
                                }
                                Err(e) => {
                                    return (
                                        StatusCode::BAD_GATEWAY,
                                        format!("Failed to proxy to cloud AI: {}", e)
                                    ).into_response();
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    let mut is_connected = false;
    {
        let client_state = state.p2p_client.lock().await;
        if let crate::client::ConnectionStatus::Connected { .. } = client_state.status() {
            is_connected = true;
        }
    }

    if !is_connected {
        let error_body = serde_json::json!({
            "error": {
                "message": "Not connected to a host. Start the tunnel first.",
                "type": "connection_error"
            }
        });
        let mut headers = HeaderMap::new();
        headers.insert(axum::http::header::CONTENT_TYPE, HeaderValue::from_static("application/json"));
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            headers,
            axum::response::Json(error_body).to_string()
        ).into_response();
    }

    // We are connected! Send to P2P Host
    let rx = {
        let mut client_state = state.p2p_client.lock().await;
        match client_state.proxy_http_request(proxy_req).await {
            Ok(rx) => rx,
            Err(e) => {
                return (
                    StatusCode::BAD_GATEWAY,
                    format!("Failed to send proxy request to remote host: {}", e),
                ).into_response();
            }
        }
    };
