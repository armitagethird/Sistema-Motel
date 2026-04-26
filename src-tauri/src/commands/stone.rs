use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct StoneOrderRequest {
    pub amount: u64,
    pub description: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StoneOrderResponse {
    pub id: String,
    pub status: String,
    pub amount: u64,
}

/// Creates a payment order via Stone/Pagar.me API.
/// The secret key is kept here in Rust — never exposed to the frontend.
#[tauri::command]
pub async fn stone_create_order(amount: u64, description: String) -> Result<String, String> {
    let secret_key = std::env::var("STONE_SECRET_KEY")
        .map_err(|_| "STONE_SECRET_KEY not configured".to_string())?;
    let account_id = std::env::var("STONE_ACCOUNT_ID")
        .map_err(|_| "STONE_ACCOUNT_ID not configured".to_string())?;

    let client = reqwest::Client::new();
    let payload = serde_json::json!({
        "amount": amount,
        "currency": "BRL",
        "payment_method": "credit_card",
        "description": description,
    });

    let response = client
        .post(format!(
            "https://api.pagar.me/core/v5/accounts/{}/orders",
            account_id
        ))
        .basic_auth(&secret_key, Some(""))
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Stone request failed: {}", e))?;

    if !response.status().is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Stone error: {}", body));
    }

    let order: StoneOrderResponse = response
        .json()
        .await
        .map_err(|e| format!("Stone parse error: {}", e))?;

    Ok(order.id)
}

/// Cancels a Stone order (void)
#[tauri::command]
pub async fn stone_cancel_order(order_id: String) -> Result<(), String> {
    let secret_key = std::env::var("STONE_SECRET_KEY")
        .map_err(|_| "STONE_SECRET_KEY not configured".to_string())?;
    let account_id = std::env::var("STONE_ACCOUNT_ID")
        .map_err(|_| "STONE_ACCOUNT_ID not configured".to_string())?;

    let client = reqwest::Client::new();
    let response = client
        .delete(format!(
            "https://api.pagar.me/core/v5/accounts/{}/orders/{}/closed",
            account_id, order_id
        ))
        .basic_auth(&secret_key, Some(""))
        .send()
        .await
        .map_err(|e| format!("Stone cancel request failed: {}", e))?;

    if !response.status().is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Stone cancel error: {}", body));
    }

    Ok(())
}
