/// Auth commands are thin wrappers — Supabase JS SDK handles auth on the frontend.
/// These commands exist for operations that require server-side trust.

#[tauri::command]
pub async fn auth_logout() -> Result<(), String> {
    // Clears any server-side session state if needed
    Ok(())
}

/// Sends a WhatsApp alert via Evolution API when a void is approved.
#[tauri::command]
pub async fn auth_notify_void(
    approver_name: String,
    suite_number: i32,
    reason: String,
) -> Result<(), String> {
    let message = format!(
        "⚠️ *Cancelamento aprovado*\nSuíte: {}\nAprovado por: {}\nMotivo: {}",
        suite_number, approver_name, reason
    );
    send_whatsapp(&message).await
}

/// Alerta de excesso de tempo: disparado quando uma suíte inicia mais
/// uma hora adicional sem checkout. Vale para estadia 2h (após o tempo
/// base) e para pernoite (após 06:00). Cobra-se R$15 por hora iniciada.
#[tauri::command]
pub async fn auth_notify_overtime(
    suite_number: i32,
    extra_hours: i32,
    extra_value: f64,
    minutes_overdue: i32,
) -> Result<(), String> {
    let message = if extra_hours <= 0 {
        format!(
            "⏰ *Tempo base atingido*\nSuíte: {}\nAtraso: {} min\nSem sinal de saída.",
            suite_number, minutes_overdue
        )
    } else {
        format!(
            "⏰ *Hora adicional iniciada*\nSuíte: {}\nHoras extras: {}\nAdicional acumulado: R$ {:.2}\nAtraso: {} min",
            suite_number, extra_hours, extra_value, minutes_overdue
        )
    };
    send_whatsapp(&message).await
}

/// Alerta pernoite: disparado uma vez quando faltam ≤30min para o
/// horário de saída do pernoite (06:00). Notifica recepção/dono pra
/// preparar a saída do hóspede.
#[tauri::command]
pub async fn auth_notify_pernoite_close(
    suite_number: i32,
    minutes_left: i32,
) -> Result<(), String> {
    let message = format!(
        "🌙 *Pernoite encerrando*\nSuíte: {}\nFaltam {} min para 06:00\nPreparar saída do hóspede.",
        suite_number, minutes_left
    );
    send_whatsapp(&message).await
}

async fn send_whatsapp(message: &str) -> Result<(), String> {
    let api_url = std::env::var("EVOLUTION_API_URL")
        .map_err(|_| "EVOLUTION_API_URL not configured".to_string())?;
    let api_key = std::env::var("EVOLUTION_API_KEY")
        .map_err(|_| "EVOLUTION_API_KEY not configured".to_string())?;
    let owner_phone = std::env::var("OWNER_PHONE").unwrap_or_default();

    if owner_phone.is_empty() {
        return Ok(());
    }

    let client = reqwest::Client::new();
    let payload = serde_json::json!({
        "number": owner_phone,
        "text": message
    });

    client
        .post(format!("{}/message/sendText/paraiso", api_url))
        .header("apikey", &api_key)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("WhatsApp notification failed: {}", e))?;

    Ok(())
}
