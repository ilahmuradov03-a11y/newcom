// index.js - RENDER ÜÇÜN TAM OPTİMİZƏ EDİLMİŞ SÜRƏTLİ VERSİYA (v2.1 - lag/menyu/bildiriş düzəlişləri)
const TelegramBot = require('node-telegram-bot-api');
const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { Logger } = require('telegram/extensions');
const { NewMessage } = require('telegram/events');
const fetch = require('node-fetch');
const http = require('http');
const bigInt = require('big-integer');
const https = require('https');

process.on('uncaughtException', (err) => console.error('Kritik Xəta:', err.message));
process.on('unhandledRejection', (r) => console.error('Tutulmayan Xəta:', r));
Logger.setLevel('none');

// ============ SERVER ============
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => { res.writeHead(200); res.end("Bot isleyir."); }).listen(PORT, '0.0.0.0');
const SELF_URL = process.env.RENDER_EXTERNAL_URL || process.env.SELF_URL || `http://0.0.0.0:${PORT}`;
// Render pulsuz planda 15 dəq sorğu olmasa server yatır -> avtocavab dayanır. Public URL-ə ping bunu önləyir.
setInterval(() => fetch(SELF_URL).catch(() => {}), 4 * 60 * 1000);

// ============ KONFİQ ============
const BOT_TOKEN = "8973379504:AAEGZlWa5_0pC-GL2oOvUXfIefyPT1GeXiY";
const API_ID = 36726228;
const API_HASH = "59b3c57e519c9cf2463b8725bc7c4f36";
const FIREBASE_URL = "https://botadmin-53dc8-default-rtdb.europe-west1.firebasedatabase.app";
const SUPPORT_URL = "https://t.me/EliteBotSupport";
const ALL_BOTS_URL = "https://t.me/+1MsfqoAHmaQ1ZTli";
const DEFAULT_TOURS_BEFORE_PAUSE = 5;
const DEFAULT_PAUSE_MINUTES = 30;
const DEFAULT_AUTOREPLY_COOLDOWN_DAYS = 4;

// Daha sürətli polling: qısa interval, uzun-poll, keep-alive və IPv4 (Render-də gecikməni azaldır)
const bot = new TelegramBot(BOT_TOKEN, {
  polling: { interval: 100, autoStart: true, params: { timeout: 25 } },
  request: { agentOptions: { keepAlive: true, family: 4 } }
});
bot.on('polling_error', (error) => console.log('Polling xətası:', error.message));

// ============ DATABASE ============
// Bütün sorğulara timeout + keep-alive əlavə edilib: asılı qalan Firebase sorğusu artıq bütün döngünü dondurmur.
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 30 });
const DB_TIMEOUT_MS = 15000;
async function getDB(path) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(`${FIREBASE_URL}/${path}.json`, { agent: httpsAgent, timeout: DB_TIMEOUT_MS });
      const j = await r.json();
      if (j && typeof j === 'object' && !Array.isArray(j) && typeof j.error === 'string') {
        console.error(`DB oxuma xətası [${path}]: ${j.error}`);
        return null;
      }
      return j;
    } catch (e) {
      if (attempt === 1) return null;
      await new Promise(res => setTimeout(res, 300));
    }
  }
  return null;
}
async function setDB(path, data) {
  try {
    const r = await fetch(`${FIREBASE_URL}/${path}.json`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      agent: httpsAgent, timeout: DB_TIMEOUT_MS
    });
    if (!r.ok) console.error(`DB yazma xətası [${path}]: HTTP ${r.status}`);
  } catch (e) { console.error("DB xətası:", e.message); }
}
async function updateDB(path, partial) {
  try {
    const r = await fetch(`${FIREBASE_URL}/${path}.json`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(partial),
      agent: httpsAgent, timeout: DB_TIMEOUT_MS
    });
    if (!r.ok) console.error(`DB update xətası [${path}]: HTTP ${r.status}`);
  } catch (e) { console.error("DB update xətası:", e.message); }
}

// ============ DİL FAYLLARI ============
const langData = {
  az: {
    about: "🤖 *ELITE OTOMESAJ BOTU*\n\nXoş gəlmisiniz! Zəhmət olmasa, aşağıdakı menyudan əməliyyat seçin.",
    sub_msg: "Aşağıdakı kanallara abunə olun:", sub_btn: "✅ Abunəlikləri Təsdiqlə",
    checking: "⏳ Abunəlik yoxlanılır...", confirmed: "✅ Təsdiqləndi!",
    not_subscribed: "❌ Siz hələ bütün kanallara abunə olmamısınız!",
    btn_act_lic: "🔑 Lisenziya Aktivləşdir", btn_buy_lic: "🛒 Lisenziya Al / Dəstək",
    btn_price: "📋 Qiymət Cədvəli", btn_web: "🌐 Web Sitemiz",
    menu_lic: "✅ Lisenziya Aktivdir! Ana Menyu:",
    btn_add_num: "➕ Yeni Nömrə Əlavə Et", btn_manage: "⚙️ Hesablarım",
    enter_lic: "Lisenziya kodunu daxil edin (ELITE-12345):",
    invalid_lic: "❌ Keçərsiz kod formatı.", not_found_lic: "❌ Lisenziya tapılmadı.",
    blocked_lic: "❌ Bu lisenziya bloklanıb və ya müddəti bitib.",
    used_lic: "❌ Bu lisenziya başqa istifadəçi tərəfindən istifadə olunur.",
    success_lic: "✅ Lisenziya uğurla aktivləşdirildi!", no_lic: "❌ Aktiv lisenziyanız yoxdur.",
    limit_reached: "❌ Lisenziya limitinizə çatdınız (Maks: {max}).",
    enter_phone: "📱 Telegram nömrənizi daxil edin (+994501234567):",
    no_numbers: "⚠️ Hələ heç bir nömrə əlavə edilməyib.",
    my_accounts: "⚙️ *Aktiv Hesablarınız:*\n\n",
    stopped: "🔴 Dayandırılıb", active: "🟢 Aktiv",
    stop_btn: "⏹ Dayandır", resume_btn: "▶️ Başlat", back_main: "🔙 Ana Menyu",
    phone_format: "⚠️ Nömrə '+' ilə başlamalıdır!",
    otp_sent: "⏳ OTP kodu göndərilir...",
    otp_info: "📩 Təhlükəsizlik kodunu daxil edin (boşluqla):",
    err: "❌ Xəta: ", sess_lost: "⚠️ Sessiya itdi. Yenidən başlayın.",
    login_success: "✅ {phone} hesabına giriş edildi!\n\nİndi qrupun istifadəçi adını (@) və ya linkini göndərin:",
    otp_err: "❌ OTP səhvdir. Xəta: ",
    group_added: "✅ Qrup əlavə olundu. (Cəmi {count} qrup)",
    add_more: "➕ Başqa qrup əlavə et", finish_btn: "✅ Bitir və Davam Et",
    send_group: "Qrupun adını (@) və ya linkini göndərin:",
    ask_interval: "✅ İntervalı daxil edin (120-300 saniyə):",
    interval_err: "⚠️ 120 ilə 300 arası rəqəm daxil edin.",
    ch1_btn: "📢 Məcburi Kanal 1", ch2_btn: "📢 Məcburi Kanal 2",
    stop_single: "⏹ +{phone} dayandırıldı.",
    resume_single: "▶️ +{phone} başladı.",
    source_prompt: "📥 Mənbə seçin:",
    source_saved_btn: "💾 Yadda saxlanmış mesajlar",
    source_library_btn: "📚 Kitabxanadan seç",
    source_custom_btn: "🔗 Xüsusi Kanal/Qrup/Bot",
    enter_source: "📢 Mənbə kanalının adını (@) və ya linkini göndərin:",
    invalid_source: "❌ Mənbəyə giriş olmadı.",
    source_set_saved: "✅ Mənbə: Yadda saxlanmış mesajlar.",
    source_set_custom: "✅ Mənbə: {target}",
    source_set_library: "✅ Mənbə: 📚 {name}",
    cancel_btn: "❌ Ləğv et", groups_btn: "📋 Qrupları İdarə Et",
    source_btn: "📥 Mənbəni İdarə Et", delete_btn: "🗑 Nömrəni Sil",
    back_btn: "🔙 Geri", del_group_btn: "❌ Sil: {group}",
    del_source_btn: "❌ Mənbəni sil", no_groups: "❌ Heç bir qrup yoxdur.",
    confirm_delete_num: "❗️ +{phone} silinsin?",
    confirm_delete_num_yes: "✅ Bəli, sil", confirm_delete_num_no: "❌ Xeyr",
    num_deleted: "✅ +{phone} silindi.", group_deleted: "✅ Qrup silindi.",
    source_deleted: "✅ Mənbə silindi.", add_group_btn: "➕ Yeni Qrup Əlavə Et",
    change_source_btn: "🔄 Mənbəni Dəyiş", change_interval_btn: "⏱ Intervalı Dəyiş",
    auto_reply_btn: "📩 Avtomatik Cavab", set_auto_reply: "📩 Avtomatik cavab mətnini daxil edin:",
    auto_reply_set: "✅ Avtocavab aktivləşdirildi.", auto_reply_deleted: "✅ Avtocavab silindi.",
    scan_btn: "🔍 Qrup Skanı", scanning: "⏳ Skan edilir...",
    select_groups: "📋 Qruplardan seçin. Seçilmiş: {count}",
    scan_select: "✅ Seç", scan_unselect: "❌ Sil",
    scan_confirm: "✅ Seçilmişləri əlavə et", scan_more: "⏭ Növbəti", scan_back: "⏮ Əvvəlki",
    scan_done: "✅ {count} qrup seçildi.", no_groups_found: "❌ Heç bir qrup tapılmadı.",
    scan_page: "Səhifə {page}/{total}",
    new_interval_prompt: "⏱ Yeni interval (120-300 saniyə):",
    interval_updated: "✅ İnterval {sec} saniyəyə dəyişdirildi.",
    session_expired: "⚠️ Sessiya bitdi. Yenidən skan edin.",
    auto_reply_on: "🟢 Avtocavab aktiv", auto_reply_off: "🔴 Avtocavab dayandırılıb",
    auto_reply_toggle_on: "▶️ Başlat", auto_reply_toggle_off: "⏹ Dayandır",
    auto_reply_enabled: "✅ Avtocavab aktivləşdirildi.", auto_reply_disabled: "✅ Avtocavab dayandırıldı.",
    admin_phone_change_prompt: "Nömrə yenilənməsi üçün təsdiq göndərildi.",
    btn_all_bots: "🤖 Bütün Botlar", btn_renew_lic: "🔑 Lisenziyanı yenilə / Aktivləşdir",
    lic_expired_msg: "⛔ Lisenziya müddəti bitdi. Bot avtomatik dayandırıldı.",
    lic_frozen_msg: "❄️ Lisenziya dondurulub. Dəstəklə əlaqə saxlayın.",
    pause_started: "⏳ {tours} tur tamamlandı. {min} dəqiqəlik fasilə başladı.",
    err_group_restrict: "⚠️ Qrupda məhdudiyyət ({kind}): {group}\nHesab: +{phone}\n{detail}",
    err_account_flood: "⚠️ Flood limiti: +{phone}\n{detail}",
    err_account_logout: "⚠️ Hesab çıxış etdi: +{phone}\n{detail}",
    err_account_other: "⚠️ Xəta (+{phone}): {detail}",
    // NEW: Library
    btn_library: "📚 Mesaj Kitabxanası", btn_stats: "📊 Statistikalar",
    lib_title: "📚 *Mesaj Kitabxanası*\n\nMüstəqil məzmun mənbələriniz:",
    lib_empty: "📚 Kitabxana boşdur. Yeni mənbə yaradın.",
    lib_new: "➕ Yeni mənbə", lib_new_name: "📝 Mənbəyə ad verin:",
    lib_new_content: "📤 İndi mənbənin məzmununu göndərin (mətn, şəkil və ya video):",
    lib_saved: "✅ Mənbə yadda saxlanıldı: {name}",
    lib_view_title: "📚 *Mənbə:* {name}\n\n📌 Növ: {type}\n📄 Məzmun: {content}",
    lib_delete: "🗑 Sil", lib_edit: "✏️ Redaktə et", lib_use: "✅ Bu mənbəni istifadə et",
    lib_confirm_delete: "❗️ '{name}' silinsin?",
    lib_deleted: "✅ Mənbə silindi.",
    lib_set_as_source: "✅ Mənbə təyin edildi: {name}",
    // NEW: Stats
    stats_title: "📊 *Statistikalar*",
    stats_today: "Bugün", stats_week: "Son 7 gün", stats_month: "Son 30 gün", stats_total: "Ümumi",
    stats_success: "Uğurlu", stats_failed: "Uğursuz",
    stats_no_data: "Hələ heç bir göndəriş yoxdur.",
    // NEW: License info
    lic_info_title: "🔑 *Lisenziya Məlumatları*",
    lic_code: "Kod", lic_type: "Növ", lic_start: "Başlama", lic_end: "Bitmə",
    lic_days_left: "Qalan gün", lic_max_acc: "Hesab limiti"
  },
  tr: {
    about: "🤖 *ELITE OTOMESAJ BOTU*\n\nHoş geldiniz!",
    sub_msg: "Kanallara abone olun:", sub_btn: "✅ Aboneliği Doğrula",
    checking: "⏳ Kontrol ediliyor...", confirmed: "✅ Onaylandı!",
    not_subscribed: "❌ Tüm kanallara abone olmadınız!",
    btn_act_lic: "🔑 Lisans Etkinleştir", btn_buy_lic: "🛒 Lisans Satın Al",
    btn_price: "📋 Fiyat Listesi", btn_web: "🌐 Web Sitemiz",
    menu_lic: "✅ Lisans Aktif! Ana Menü:", btn_add_num: "➕ Yeni Numara Ekle",
    btn_manage: "⚙️ Hesaplarım", enter_lic: "Lisans kodunu girin:",
    invalid_lic: "❌ Geçersiz format.", not_found_lic: "❌ Lisans bulunamadı.",
    blocked_lic: "❌ Bu lisans engellenmiş.", used_lic: "❌ Bu lisans kullanılıyor.",
    success_lic: "✅ Lisans etkinleştirildi!", no_lic: "❌ Aktif lisans yok.",
    limit_reached: "❌ Limit aşıldı (Maks: {max}).",
    enter_phone: "📱 Telegram numaranızı girin (+90501234567):",
    no_numbers: "⚠️ Numara eklenmedi.", my_accounts: "⚙️ *Aktif Hesaplar:*\n\n",
    stopped: "🔴 Durduruldu", active: "🟢 Aktif", stop_btn: "⏹ Durdur",
    resume_btn: "▶️ Başlat", back_main: "🔙 Ana Menü",
    phone_format: "⚠️ Numara '+' ile başlamalı!", otp_sent: "⏳ OTP gönderiliyor...",
    otp_info: "📩 Kodu girin (boşlukla):", err: "❌ Hata: ",
    sess_lost: "⚠️ Oturum kayboldu.", login_success: "✅ {phone} giriş yapıldı!",
    otp_err: "❌ OTP yanlış: ", group_added: "✅ Grup eklendi.",
    add_more: "➕ Grup ekle", finish_btn: "✅ Bitir", send_group: "Grup adı veya link:",
    ask_interval: "✅ İnterval (120-300 saniye):", interval_err: "⚠️ 120-300 arası girin.",
    ch1_btn: "📢 Kanal 1", ch2_btn: "📢 Kanal 2",
    stop_single: "⏹ +{phone} durduruldu.", resume_single: "▶️ +{phone} başladı.",
    source_prompt: "📥 Kaynak seçin:", source_saved_btn: "💾 Kaydedilmiş",
    source_library_btn: "📚 Kütüphane", source_custom_btn: "🔗 Özel",
    enter_source: "📢 Kaynak adı veya link:", invalid_source: "❌ Erişilemedi.",
    source_set_saved: "✅ Kaynak: Kaydedilmiş.", source_set_custom: "✅ Kaynak: {target}",
    source_set_library: "✅ Kaynak: 📚 {name}", cancel_btn: "❌ İptal",
    groups_btn: "📋 Grupları Yönet", source_btn: "📥 Kaynağı Yönet",
    delete_btn: "🗑 Sil", back_btn: "🔙 Geri", del_group_btn: "❌ Sil: {group}",
    del_source_btn: "❌ Kaynağı sil", no_groups: "❌ Grup yok.",
    confirm_delete_num: "❗️ +{phone} silinsin?", confirm_delete_num_yes: "✅ Evet",
    confirm_delete_num_no: "❌ Hayır", num_deleted: "✅ Silindi.",
    group_deleted: "✅ Grup silindi.", source_deleted: "✅ Kaynak silindi.",
    add_group_btn: "➕ Grup ekle", change_source_btn: "🔄 Kaynağı değiştir",
    change_interval_btn: "⏱ Aralığı değiştir", auto_reply_btn: "📩 Oto Yanıt",
    set_auto_reply: "📩 Oto yanıt metni:", auto_reply_set: "✅ Aktif.",
    auto_reply_deleted: "✅ Silindi.", scan_btn: "🔍 Grup Tara",
    scanning: "⏳ Taranıyor...", select_groups: "📋 Seçin. Seçilen: {count}",
    scan_select: "✅ Seç", scan_unselect: "❌ Sil", scan_confirm: "✅ Ekle",
    scan_more: "⏭ Sonraki", scan_back: "⏮ Önceki", scan_done: "✅ {count} eklendi.",
    no_groups_found: "❌ Grup bulunamadı.", scan_page: "Sayfa {page}/{total}",
    new_interval_prompt: "⏱ Yeni (120-300):", interval_updated: "✅ Değiştirildi: {sec}",
    session_expired: "⚠️ Oturum bitti.", auto_reply_on: "🟢 Aktif",
    auto_reply_off: "🔴 Durduruldu", auto_reply_toggle_on: "▶️ Başlat",
    auto_reply_toggle_off: "⏹ Durdur", auto_reply_enabled: "✅ Aktif.",
    auto_reply_disabled: "✅ Durduruldu.", admin_phone_change_prompt: "Onay gönderildi.",
    btn_all_bots: "🤖 Tüm Botlar", btn_renew_lic: "🔑 Yenile",
    lic_expired_msg: "⛔ Lisans süresi doldu.",
    lic_frozen_msg: "❄️ Lisans dondurulmuş.",
    pause_started: "⏳ {tours} tur. {min} dk mola.",
    err_group_restrict: "⚠️ Grup kısıtlaması: {group}",
    err_account_flood: "⚠️ Flood: +{phone}", err_account_logout: "⚠️ Çıkış: +{phone}",
    err_account_other: "⚠️ Hata: {detail}",
    btn_library: "📚 Kütüphane", btn_stats: "📊 İstatistik",
    lib_title: "📚 *Kütüphane*:", lib_empty: "📚 Boş.",
    lib_new: "➕ Yeni kaynak", lib_new_name: "📝 Kaynak adı:",
    lib_new_content: "📤 İçerik gönderin:", lib_saved: "✅ Kaydedildi: {name}",
    lib_view_title: "📚 *{name}*\n📌 Tür: {type}\n📄 {content}",
    lib_delete: "🗑 Sil", lib_edit: "✏️ Düzenle", lib_use: "✅ Kullan",
    lib_confirm_delete: "❗️ '{name}' silinsin?", lib_deleted: "✅ Silindi.",
    lib_set_as_source: "✅ Atandı: {name}",
    stats_title: "📊 *İstatistik*", stats_today: "Bugün", stats_week: "7 gün",
    stats_month: "30 gün", stats_total: "Toplam", stats_success: "Başarılı",
    stats_failed: "Başarısız", stats_no_data: "Veri yok.",
    lic_info_title: "🔑 *Lisans*", lic_code: "Kod", lic_type: "Tür",
    lic_start: "Başlangıç", lic_end: "Bitiş", lic_days_left: "Kalan gün", lic_max_acc: "Hesap limiti"
  },
  en: {
    about: "🤖 *ELITE OTOMESAJ BOTU*\n\nWelcome!",
    sub_msg: "Subscribe to channels:", sub_btn: "✅ Verify",
    checking: "⏳ Checking...", confirmed: "✅ Confirmed!",
    not_subscribed: "❌ Not subscribed to all channels!",
    btn_act_lic: "🔑 Activate License", btn_buy_lic: "🛒 Buy License",
    btn_price: "📋 Price List", btn_web: "🌐 Our Website",
    menu_lic: "✅ License Active!", btn_add_num: "➕ Add Number",
    btn_manage: "⚙️ My Accounts", enter_lic: "Enter license code:",
    invalid_lic: "❌ Invalid format.", not_found_lic: "❌ Not found.",
    blocked_lic: "❌ License blocked.", used_lic: "❌ Already used.",
    success_lic: "✅ Activated!", no_lic: "❌ No active license.",
    limit_reached: "❌ Limit reached (Max: {max}).",
    enter_phone: "📱 Enter phone (+994501234567):",
    no_numbers: "⚠️ No numbers.", my_accounts: "⚙️ *My Accounts:*\n\n",
    stopped: "🔴 Stopped", active: "🟢 Active", stop_btn: "⏹ Stop",
    resume_btn: "▶️ Start", back_main: "🔙 Main Menu",
    phone_format: "⚠️ Number must start with '+'!", otp_sent: "⏳ Sending OTP...",
    otp_info: "📩 Enter code (with spaces):", err: "❌ Error: ",
    sess_lost: "⚠️ Session lost.", login_success: "✅ Logged in to {phone}!",
    otp_err: "❌ OTP wrong: ", group_added: "✅ Group added.",
    add_more: "➕ Add group", finish_btn: "✅ Finish", send_group: "Send group (@) or link:",
    ask_interval: "✅ Interval (120-300s):", interval_err: "⚠️ Enter 120-300.",
    ch1_btn: "📢 Channel 1", ch2_btn: "📢 Channel 2",
    stop_single: "⏹ +{phone} stopped.", resume_single: "▶️ +{phone} started.",
    source_prompt: "📥 Select source:", source_saved_btn: "💾 Saved messages",
    source_library_btn: "📚 Library", source_custom_btn: "🔗 Custom",
    enter_source: "📢 Source (@) or link:", invalid_source: "❌ Cannot access.",
    source_set_saved: "✅ Source: Saved.", source_set_custom: "✅ Source: {target}",
    source_set_library: "✅ Source: 📚 {name}", cancel_btn: "❌ Cancel",
    groups_btn: "📋 Groups", source_btn: "📥 Source", delete_btn: "🗑 Delete",
    back_btn: "🔙 Back", del_group_btn: "❌ Delete: {group}",
    del_source_btn: "❌ Delete source", no_groups: "❌ No groups.",
    confirm_delete_num: "❗️ Delete +{phone}?", confirm_delete_num_yes: "✅ Yes",
    confirm_delete_num_no: "❌ No", num_deleted: "✅ Deleted.",
    group_deleted: "✅ Group deleted.", source_deleted: "✅ Source deleted.",
    add_group_btn: "➕ Add group", change_source_btn: "🔄 Change source",
    change_interval_btn: "⏱ Change interval", auto_reply_btn: "📩 Auto Reply",
    set_auto_reply: "📩 Enter auto-reply:", auto_reply_set: "✅ Activated.",
    auto_reply_deleted: "✅ Deleted.", scan_btn: "🔍 Scan Groups",
    scanning: "⏳ Scanning...", select_groups: "📋 Select. Selected: {count}",
    scan_select: "✅ Select", scan_unselect: "❌ Remove", scan_confirm: "✅ Add",
    scan_more: "⏭ Next", scan_back: "⏮ Prev", scan_done: "✅ {count} added.",
    no_groups_found: "❌ No groups.", scan_page: "Page {page}/{total}",
    new_interval_prompt: "⏱ New (120-300):", interval_updated: "✅ Changed: {sec}s",
    session_expired: "⚠️ Session expired.", auto_reply_on: "🟢 Active",
    auto_reply_off: "🔴 Stopped", auto_reply_toggle_on: "▶️ Start",
    auto_reply_toggle_off: "⏹ Stop", auto_reply_enabled: "✅ Enabled.",
    auto_reply_disabled: "✅ Disabled.", admin_phone_change_prompt: "Confirmation sent.",
    btn_all_bots: "🤖 All Bots", btn_renew_lic: "🔑 Renew",
    lic_expired_msg: "⛔ License expired.", lic_frozen_msg: "❄️ License frozen.",
    pause_started: "⏳ {tours} rounds. {min}min pause.",
    err_group_restrict: "⚠️ Group restrict: {group}",
    err_account_flood: "⚠️ Flood: +{phone}", err_account_logout: "⚠️ Logout: +{phone}",
    err_account_other: "⚠️ Error: {detail}",
    btn_library: "📚 Library", btn_stats: "📊 Statistics",
    lib_title: "📚 *Library*:", lib_empty: "📚 Empty.",
    lib_new: "➕ New source", lib_new_name: "📝 Source name:",
    lib_new_content: "📤 Send content:", lib_saved: "✅ Saved: {name}",
    lib_view_title: "📚 *{name}*\n📌 Type: {type}\n📄 {content}",
    lib_delete: "🗑 Delete", lib_edit: "✏️ Edit", lib_use: "✅ Use",
    lib_confirm_delete: "❗️ Delete '{name}'?", lib_deleted: "✅ Deleted.",
    lib_set_as_source: "✅ Set: {name}",
    stats_title: "📊 *Statistics*", stats_today: "Today", stats_week: "7d",
    stats_month: "30d", stats_total: "Total", stats_success: "Success",
    stats_failed: "Failed", stats_no_data: "No data.",
    lic_info_title: "🔑 *License*", lic_code: "Code", lic_type: "Type",
    lic_start: "Start", lic_end: "End", lic_days_left: "Days left", lic_max_acc: "Max accounts"
  },
  ru: {
    about: "🤖 *ELITE*\n\nДобро пожаловать!",
    sub_msg: "Подпишитесь:", sub_btn: "✅ Проверить",
    checking: "⏳ Проверка...", confirmed: "✅ Подтверждено!",
    not_subscribed: "❌ Не подписаны!",
    btn_act_lic: "🔑 Активировать", btn_buy_lic: "🛒 Купить",
    btn_price: "📋 Прайс", btn_web: "🌐 Сайт",
    menu_lic: "✅ Лицензия активна!", btn_add_num: "➕ Добавить номер",
    btn_manage: "⚙️ Аккаунты", enter_lic: "Введите код:",
    invalid_lic: "❌ Неверный формат.", not_found_lic: "❌ Не найдена.",
    blocked_lic: "❌ Заблокирована.", used_lic: "❌ Используется.",
    success_lic: "✅ Активирована!", no_lic: "❌ Нет лицензии.",
    limit_reached: "❌ Лимит (Макс: {max}).",
    enter_phone: "📱 Номер (+994501234567):",
    no_numbers: "⚠️ Нет номеров.", my_accounts: "⚙️ *Аккаунты:*\n\n",
    stopped: "🔴 Остановлено", active: "🟢 Активно", stop_btn: "⏹ Стоп",
    resume_btn: "▶️ Старт", back_main: "🔙 Меню",
    phone_format: "⚠️ Номер с '+'!", otp_sent: "⏳ OTP...",
    otp_info: "📩 Код (с пробелами):", err: "❌ Ошибка: ",
    sess_lost: "⚠️ Сессия потеряна.", login_success: "✅ Вход в {phone}!",
    otp_err: "❌ OTP неверен: ", group_added: "✅ Группа добавлена.",
    add_more: "➕ Добавить", finish_btn: "✅ Готово", send_group: "Имя/ссылка группы:",
    ask_interval: "✅ Интервал (120-300):", interval_err: "⚠️ От 120 до 300.",
    ch1_btn: "📢 Канал 1", ch2_btn: "📢 Канал 2",
    stop_single: "⏹ +{phone} остановлен.", resume_single: "▶️ +{phone} запущен.",
    source_prompt: "📥 Источник:", source_saved_btn: "💾 Сохранённые",
    source_library_btn: "📚 Библиотека", source_custom_btn: "🔗 Свой",
    enter_source: "📢 Имя/ссылка:", invalid_source: "❌ Нет доступа.",
    source_set_saved: "✅ Сохранённые.", source_set_custom: "✅ {target}",
    source_set_library: "✅ 📚 {name}", cancel_btn: "❌ Отмена",
    groups_btn: "📋 Группы", source_btn: "📥 Источник", delete_btn: "🗑 Удалить",
    back_btn: "🔙 Назад", del_group_btn: "❌ {group}", del_source_btn: "❌ Удалить",
    no_groups: "❌ Групп нет.", confirm_delete_num: "❗️ Удалить +{phone}?",
    confirm_delete_num_yes: "✅ Да", confirm_delete_num_no: "❌ Нет",
    num_deleted: "✅ Удалён.", group_deleted: "✅ Удалена.",
    source_deleted: "✅ Удалён.", add_group_btn: "➕ Добавить",
    change_source_btn: "🔄 Сменить", change_interval_btn: "⏱ Интервал",
    auto_reply_btn: "📩 Автоответ", set_auto_reply: "📩 Текст:",
    auto_reply_set: "✅ Активен.", auto_reply_deleted: "✅ Удалён.",
    scan_btn: "🔍 Скан", scanning: "⏳ Скан...", select_groups: "📋 Выбрано: {count}",
    scan_select: "✅", scan_unselect: "❌", scan_confirm: "✅ Добавить",
    scan_more: "⏭", scan_back: "⏮", scan_done: "✅ {count} добавлено.",
    no_groups_found: "❌ Не найдено.", scan_page: "{page}/{total}",
    new_interval_prompt: "⏱ (120-300):", interval_updated: "✅ {sec}с",
    session_expired: "⚠️ Сессия истекла.", auto_reply_on: "🟢 Активен",
    auto_reply_off: "🔴 Остановлен", auto_reply_toggle_on: "▶️ Старт",
    auto_reply_toggle_off: "⏹ Стоп", auto_reply_enabled: "✅ Включён.",
    auto_reply_disabled: "✅ Выключен.", admin_phone_change_prompt: "Отправлено.",
    btn_all_bots: "🤖 Все боты", btn_renew_lic: "🔑 Продлить",
    lic_expired_msg: "⛔ Лицензия истекла.", lic_frozen_msg: "❄️ Заморожена.",
    pause_started: "⏳ {tours} кругов. Пауза {min} мин.",
    err_group_restrict: "⚠️ Ограничение: {group}",
    err_account_flood: "⚠️ Flood: +{phone}", err_account_logout: "⚠️ Выход: +{phone}",
    err_account_other: "⚠️ {detail}",
    btn_library: "📚 Библиотека", btn_stats: "📊 Статистика",
    lib_title: "📚 *Библиотека*:", lib_empty: "📚 Пусто.",
    lib_new: "➕ Источник", lib_new_name: "📝 Имя:",
    lib_new_content: "📤 Контент:", lib_saved: "✅ {name}",
    lib_view_title: "📚 *{name}*\n📌 {type}\n📄 {content}",
    lib_delete: "🗑", lib_edit: "✏️", lib_use: "✅ Использовать",
    lib_confirm_delete: "❗️ Удалить '{name}'?", lib_deleted: "✅ Удалён.",
    lib_set_as_source: "✅ {name}",
    stats_title: "📊 *Статистика*", stats_today: "Сегодня", stats_week: "7д",
    stats_month: "30д", stats_total: "Всего", stats_success: "Успешно",
    stats_failed: "Ошибок", stats_no_data: "Нет данных.",
    lic_info_title: "🔑 *Лицензия*", lic_code: "Код", lic_type: "Тип",
    lic_start: "Начало", lic_end: "Конец", lic_days_left: "Осталось", lic_max_acc: "Лимит"
  }
};

function t(key, lang = 'az', params = {}) {
  let text = langData[lang]?.[key] || langData['az'][key] || key;
  if (params) for (const [k, v] of Object.entries(params))
    text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  return text;
}

// ============ DEFAULT SETTINGS ============
(async function initSettings() {
  const settings = await getDB('settings') || {};
  const defaults = {
    channel1: "https://t.me/EliteBotDestek", channel2: "https://t.me/EliteBotMedia",
    channel1_id: "@EliteBotDestek", channel2_id: "@EliteBotMedia",
    webUrl: "https://EliteBot.com", support: SUPPORT_URL, allBotsUrl: ALL_BOTS_URL,
    autoReplyCooldownDays: DEFAULT_AUTOREPLY_COOLDOWN_DAYS,
    toursBeforePause: 5, pauseMinutes: 30
  };
  const merged = { ...defaults, ...settings };
  merged.toursBeforePause = 5;
  merged.pauseMinutes = 30;
  await setDB('settings', merged);
})();

// ============ YARDIMÇI ============
const userStates = {}, userSessions = {}, mainMsgIds = {};
if (!global.abortFlags) global.abortFlags = {};
if (!global.runningAccounts) global.runningAccounts = new Set();
if (!global.errorNotifiedAt) global.errorNotifiedAt = {};
if (!global.expiredNotified) global.expiredNotified = {};
if (!global.frozenNotified) global.frozenNotified = {};
if (!global.pauseNotified) global.pauseNotified = {};
if (!global.autoReplyClients) global.autoReplyClients = {};
if (!global.autoReplyStarting) global.autoReplyStarting = new Set();
if (!global.notifiedLicenseThresholds) global.notifiedLicenseThresholds = {};
if (!global.localNextRun) global.localNextRun = {};
if (!global.entityCache) global.entityCache = {};
if (!global.langCache) global.langCache = {};
if (!global.profileSavedAt) global.profileSavedAt = {};
if (!global.usersSnap) global.usersSnap = { at: 0, data: null };
if (!global.licAll) global.licAll = { at: 0, data: null, p: null };

// ---- Keşlər (Firebase-ə lazımsız sorğuları kəsir -> bot cavabı sürətlənir) ----
function cachedLang(chatId) { const c = global.langCache[chatId]; return (c && c.v) || 'az'; }
function setLangCache(chatId, l) { global.langCache[chatId] = { v: l, at: Date.now() }; }
async function getLang(chatId) {
  const c = global.langCache[chatId];
  if (c && Date.now() - c.at < 10 * 60 * 1000) return c.v;
  const l = await getDB(`users/${chatId}/lang`);
  const v = (typeof l === 'string' && langData[l]) ? l : 'az';
  setLangCache(chatId, v);
  return v;
}
async function getUserFields(chatId, fields) {
  const vals = await Promise.all(fields.map(f => getDB(`users/${chatId}/${f}`)));
  const o = {};
  fields.forEach((f, i) => { o[f] = vals[i]; });
  return o;
}
// Bütün lisenziyalar 30 saniyəlik keşdə (əvvəl hər istifadəçi üçün ayrıca sorğu gedirdi)
async function getLicensesCached() {
  const c = global.licAll;
  if (c.data && Date.now() - c.at < 30000) return c.data;
  if (c.p) return c.p;
  c.p = (async () => {
    const d = await getDB('licenses');
    if (d) { c.data = d; c.at = Date.now(); }
    return c.data;
  })().finally(() => { c.p = null; });
  return c.p;
}
async function getLicense(code) {
  if (!code) return null;
  const all = await getLicensesCached();
  if (all && all[code]) return all[code];
  return getDB(`licenses/${code}`);
}
// İstifadəçi bazasının ortaq şəkli (tick hər 5 san yeniləyir; digər işlər bundan oxuyur)
async function getUsersSnap(maxAgeMs) {
  const c = global.usersSnap;
  if (c.data && Date.now() - c.at < maxAgeMs) return c.data;
  const u = await getDB('users');
  if (u) global.usersSnap = { at: Date.now(), data: u };
  return u || c.data;
}
function needsStop(user) {
  if (!user) return false;
  if (user.fullBotActive || user.autoReplyEnabled) return true;
  return Object.values(user.accounts || {}).some(a => a && a.status === 'ACTIVE');
}
function cleanupSession(chatId) {
  const s = userSessions[chatId];
  delete userSessions[chatId];
  if (s && s.client) { try { s.client.disconnect().catch(() => {}); } catch (e) {} }
}
// Avtocavab cooldown-ları users/ içindən çıxarılıb (users obyektini şişirib hər oxumanı yavaşladırdı)
(async function migrateCooldowns() {
  try {
    const users = await getDB('users');
    if (!users) return;
    for (const chatId in users) {
      const cds = users[chatId] && users[chatId].autoReplyCooldowns;
      if (cds && typeof cds === 'object') {
        await updateDB(`autoReplyCooldowns/${chatId}`, cds);
        await setDB(`users/${chatId}/autoReplyCooldowns`, null);
      }
    }
  } catch (e) { console.error('migrateCooldowns:', e.message); }
})();

function accTaskKey(chatId, phone) { return `${chatId}_${phone}`; }
function requestAbort(chatId, phone) { global.abortFlags[accTaskKey(chatId, phone)] = true; }
function requestAbortAll(chatId, accounts) {
  if (!accounts) return;
  for (const phone of Object.keys(accounts)) requestAbort(chatId, phone);
}
function isAborted(chatId, phone) { return !!global.abortFlags[accTaskKey(chatId, phone)]; }
function clearAbort(chatId, phone) { delete global.abortFlags[accTaskKey(chatId, phone)]; }

async function interruptibleSleep(ms, abortFn) {
  const step = 400; let elapsed = 0;
  while (elapsed < ms) {
    if (abortFn && abortFn()) return false;
    const chunk = Math.min(step, ms - elapsed);
    await new Promise(r => setTimeout(r, chunk));
    elapsed += chunk;
  }
  return true;
}

function classifySendError(err) {
  const m = String(err?.errorMessage || err?.message || err || '').toUpperCase();
  if (/AUTH_KEY_UNREGISTERED|SESSION_REVOKED|USER_DEACTIVATED|SESSION_EXPIRED|AUTH_KEY_INVALID|AUTH_KEY_DUPLICATED|PHONE_NUMBER_BANNED|USER_DEACTIVATED_BAN/.test(m)) return 'logout';
  if (/SLOWMODE|BEFORE SENDING ANOTHER MESSAGE/.test(m)) return 'slowmode';
  if (/PEER_FLOOD|FLOOD|A WAIT OF \d+ SECONDS/.test(m)) return 'flood';
  if (/CHAT_WRITE_FORBIDDEN|CHAT_ADMIN_REQUIRED|USER_BANNED|BANNED_IN_CHANNEL|CHAT_RESTRICTED|USER_RESTRICTED|CHAT_SEND_|YOU_BLOCKED_USER|CHAT_FORBIDDEN/.test(m)) return 'restrict';
  return 'other';
}
function restrictKind(err) {
  const m = String(err?.errorMessage || err?.message || err || '').toUpperCase();
  if (/USER_BANNED|BANNED_IN_CHANNEL|CHAT_FORBIDDEN/.test(m)) return 'Ban';
  if (/CHAT_RESTRICTED|USER_RESTRICTED|CHAT_ADMIN_REQUIRED/.test(m)) return 'Restrict';
  if (/CHAT_WRITE_FORBIDDEN|CHAT_SEND_/.test(m)) return 'Mute';
  return 'Restrict';
}
function shouldNotifyError(key, cooldownMs = 8 * 60 * 1000) {
  const last = global.errorNotifiedAt[key] || 0;
  if (Date.now() - last < cooldownMs) return false;
  global.errorNotifiedAt[key] = Date.now();
  return true;
}
async function notifyUser(chatId, text) { try { await bot.sendMessage(chatId, text); } catch (e) {} }

// ============ LİSENZİYA ============
function getLicenseExpiryMs(lic) {
  if (!lic) return null;
  const expiry = lic.expireTimestamp || lic.expiresAt || lic.expireDate;
  if (!expiry) return null;
  if (typeof expiry === 'number') return expiry;
  if (typeof expiry === 'string' && /^\d+$/.test(expiry)) return parseInt(expiry);
  const parsed = new Date(expiry).getTime();
  return isNaN(parsed) ? null : parsed;
}
function isLicenseCurrentlyValid(lic) {
  if (!lic) return false;
  if (lic.active === false) return false;
  if (lic.frozen === true) return false;
  const time = getLicenseExpiryMs(lic);
  if (typeof time === 'number' && !isNaN(time) && time > 0 && time < Date.now()) return false;
  return true;
}
function isLicenseFrozen(lic) { return lic && lic.frozen === true; }

async function saveUserProfile(chatId, fromUser) {
  if (!fromUser) return;
  const profile = {
    id: fromUser.id || chatId, username: fromUser.username || '',
    firstName: fromUser.first_name || '', lastName: fromUser.last_name || '',
    languageCode: fromUser.language_code || ''
  };
  await setDB(`users/${chatId}/profile`, profile);
  return profile;
}
async function syncLicenseUserInfo(chatId, licenseCode, fromUser) {
  if (!licenseCode) return;
  const user = await getDB(`users/${chatId}`) || {};
  const phones = user.accounts ? Object.keys(user.accounts).map(p => (String(p).startsWith('+') ? String(p) : `+${p}`)) : [];
  const info = {
    id: chatId,
    username: fromUser?.username || user.profile?.username || '',
    firstName: fromUser?.first_name || user.profile?.firstName || '',
    lastName: fromUser?.last_name || user.profile?.lastName || '',
    phones, updatedAt: new Date().toISOString()
  };
  await setDB(`licenses/${licenseCode}/usedByInfo`, info);
}

async function stopAllAccountsForLicense(chatId, user) {
  requestAbortAll(chatId, user?.accounts);
  if (user?.accounts) {
    for (const phone of Object.keys(user.accounts)) {
      await setDB(`users/${chatId}/accounts/${phone}/status`, 'STOPPED');
      await stopAutoReplyClient(chatId, phone);
    }
  }
  await setDB(`users/${chatId}/fullBotActive`, false);
  await setDB(`users/${chatId}/autoReplyEnabled`, false);
}

async function expireAndNotify(chatId, user) {
  if (needsStop(user)) await stopAllAccountsForLicense(chatId, user);
  if (global.expiredNotified[chatId]) return;
  global.expiredNotified[chatId] = true;
  const lang = user?.lang || 'az';
  try {
    await bot.sendMessage(chatId, t('lic_expired_msg', lang), {
      reply_markup: {
        inline_keyboard: [
          [{ text: t('btn_renew_lic', lang), url: SUPPORT_URL }],
          [{ text: t('btn_act_lic', lang), callback_data: 'enter_license' }]
        ]
      }
    });
  } catch (e) {}
}

async function frozenAndNotify(chatId, user) {
  if (needsStop(user)) await stopAllAccountsForLicense(chatId, user);
  if (global.frozenNotified[chatId]) return;
  global.frozenNotified[chatId] = true;
  const lang = user?.lang || 'az';
  try {
    await bot.sendMessage(chatId, t('lic_frozen_msg', lang), {
      reply_markup: {
        inline_keyboard: [[{ text: t('btn_buy_lic', lang), url: SUPPORT_URL }]]
      }
    });
  } catch (e) {}
}

// ============ STATİSTİKA ============
function trackSend(chatId, phone, contentType, success) {
  return withLock(`stats_${chatId}_${phone}`, () => _trackSend(chatId, phone, contentType, success)).catch(() => {});
}
async function _trackSend(chatId, phone, contentType, success) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const dbPath = `stats/${chatId}/${phone}`;
    const stats = await getDB(dbPath) || {};
    stats.total = (stats.total || 0) + 1;
    stats.daily = stats.daily || {};
    stats.daily[today] = (stats.daily[today] || 0) + 1;
    stats.byType = stats.byType || {};
    stats.byType[contentType] = (stats.byType[contentType] || 0) + 1;
    if (success) stats.success = (stats.success || 0) + 1;
    else stats.failed = (stats.failed || 0) + 1;
    stats.updatedAt = Date.now();
    await setDB(dbPath, stats);
  } catch (e) { console.error('Stats error:', e.message); }
}

// ============ SENDING ============
// Bot API entity -> GramJS entity (premium/custom emoji daxil olmaqla)
function botEntitiesToGram(entities) {
  if (!Array.isArray(entities) || entities.length === 0) return undefined;
  const out = [];
  for (const e of entities) {
    if (!e) continue;
    const base = { offset: e.offset, length: e.length };
    try {
      switch (e.type) {
        case 'bold': out.push(new Api.MessageEntityBold(base)); break;
        case 'italic': out.push(new Api.MessageEntityItalic(base)); break;
        case 'underline': out.push(new Api.MessageEntityUnderline(base)); break;
        case 'strikethrough': out.push(new Api.MessageEntityStrike(base)); break;
        case 'code': out.push(new Api.MessageEntityCode(base)); break;
        case 'pre': out.push(new Api.MessageEntityPre({ ...base, language: e.language || '' })); break;
        case 'text_link': out.push(new Api.MessageEntityTextUrl({ ...base, url: e.url })); break;
        case 'spoiler': if (Api.MessageEntitySpoiler) out.push(new Api.MessageEntitySpoiler(base)); break;
        case 'blockquote': if (Api.MessageEntityBlockquote) out.push(new Api.MessageEntityBlockquote(base)); break;
        case 'custom_emoji':
          if (Api.MessageEntityCustomEmoji && e.custom_emoji_id) {
            out.push(new Api.MessageEntityCustomEmoji({ ...base, documentId: bigInt(String(e.custom_emoji_id)) }));
          }
          break;
      }
    } catch (err) { console.log('Entity convert:', err.message); }
  }
  return out.length ? out : undefined;
}
function hasBotCustomEmoji(entities) {
  return Array.isArray(entities) && entities.some(e => e && e.type === 'custom_emoji');
}
function hasGramCustomEmoji(entities) {
  return Array.isArray(entities) && entities.some(e => e && e.className === 'MessageEntityCustomEmoji');
}

async function tryForward(client, sourceEntity, ids, target, dropAuthor) {
  try {
    const params = { messages: ids.length === 1 ? ids[0] : ids, fromPeer: sourceEntity };
    if (dropAuthor) params.dropAuthor = true;
    await client.forwardMessages(target, params);
    return true;
  } catch (e) {
    console.log(`Forward (dropAuthor=${!!dropAuthor}) failed:`, e.message);
    // Flood / slowmode xətalarını yuxarı ötür ki, düzgün idarə olunsun
    const kind = classifySendError(e);
    if (kind === 'flood' || kind === 'slowmode' || kind === 'logout' || kind === 'restrict') throw e;
    return false;
  }
}

// Mesajı OLDUĞU KİMİ göndər (premium emojilər qorunur)
// mode: 'auto' | 'keep' (həmişə başlıqlı forward - emoji 100% qalır) | 'hide' (həmişə başlıqsız)
// Qaytarır: false və ya 'emoji:<üsul>' / 'plain:<üsul>'
async function sendSourceAsOriginal(client, sourceEntity, sourceMsgIds, target, isPremium, mode = 'auto') {
  const ids = Array.isArray(sourceMsgIds) ? sourceMsgIds : [sourceMsgIds];
  let msgs = [];
  try { msgs = ((await client.getMessages(sourceEntity, { ids })) || []).filter(Boolean); } catch (e) {}
  const hasEmoji = msgs.some(m => hasGramCustomEmoji(m.entities));
  const tag = (m) => `${hasEmoji ? 'emoji' : 'plain'}:${m}`;
  console.log(`[send] premiumEmoji=${hasEmoji} accountPremium=${isPremium} mode=${mode} msgs=${msgs.length}`);

  if (mode === 'keep') {
    if (await tryForward(client, sourceEntity, ids, target, false)) return tag('forward-başlıqlı');
  } else if (hasEmoji && mode !== 'hide') {
    if (isPremium && msgs.length === 1) {
      try {
        const m = msgs[0];
        const hasMedia = m.media && !['MessageMediaEmpty', 'MessageMediaWebPage'].includes(m.media.className);
        if (hasMedia) await client.sendFile(target, { file: m.media, caption: m.message || '', formattingEntities: m.entities });
        else await client.sendMessage(target, { message: m.message || '', formattingEntities: m.entities });
        return tag('premium-kopya');
      } catch (e) {
        if (classifySendError(e) !== 'other') throw e;
        console.log('Premium copy failed:', e.message);
      }
    }
    if (await tryForward(client, sourceEntity, ids, target, false)) return tag('forward-başlıqlı');
  }

  if (await tryForward(client, sourceEntity, ids, target, true)) return tag('forward-başlıqsız');
  if (mode !== 'keep' && await tryForward(client, sourceEntity, ids, target, false)) return tag('forward-başlıqlı');

  try {
    if (!msgs.length) msgs = ((await client.getMessages(sourceEntity, { ids })) || []).filter(Boolean);
    const valid = msgs.filter(m => m.media && m.media.className && !['MessageMediaEmpty', 'MessageMediaWebPage'].includes(m.media.className));
    const first = msgs[0];
    if (valid.length > 0) {
      if (valid.length === 1) await client.sendFile(target, { file: valid[0].media, caption: valid[0].message || '', formattingEntities: valid[0].entities });
      else await client.sendFile(target, { file: valid.map(m => m.media), caption: first?.message || '' });
      return tag('kopya');
    } else if (first?.message) {
      await client.sendMessage(target, { message: first.message, formattingEntities: first.entities });
      return tag('kopya');
    }
  } catch (e3) {
    console.log('Fallback failed:', e3.message);
    if (classifySendError(e3) !== 'other') throw e3;
  }
  return false;
}

async function sendLibrarySource(client, source, target) {
  const entities = botEntitiesToGram(source.entities);
  try {
    if (source.contentType === 'text' && source.text) {
      await client.sendMessage(target, { message: source.text, formattingEntities: entities });
      return true;
    }
    if (source.fileId) {
      const fileUrl = await bot.getFileLink(source.fileId);
      const fileRes = await fetch(fileUrl);
      const buffer = await fileRes.buffer();
      const ext = source.contentType === 'photo' ? 'jpg' : source.contentType === 'video' ? 'mp4' : 'bin';
      buffer.name = source.fileName || `file.${ext}`;
      await client.sendFile(target, {
        file: buffer,
        caption: source.caption || '',
        formattingEntities: entities,
        forceDocument: source.contentType === 'document'
      });
      return true;
    }
    return false;
  } catch (e) {
    console.error('Library send error:', e.message);
    const kind = classifySendError(e);
    if (kind !== 'other') throw e;
    return false;
  }
}

async function fetchSourceMessages(client, sourceEntity) {
  try {
    const msgs = await client.getMessages(sourceEntity, { limit: 1 });
    if (!msgs || msgs.length === 0) return [];
    const first = msgs[0];
    if (!first) return [];
    if (first.groupedId) {
      try {
        const groupedMsgs = await client.getMessages(sourceEntity, { limit: 10, maxId: first.id + 1 });
        const gid = first.groupedId.toString();
        const album = (groupedMsgs || []).filter(m => m && m.groupedId && m.groupedId.toString() === gid).map(m => m.id).sort((a, b) => a - b);
        if (album.length > 0) return album;
      } catch (e) {}
    }
    return [first.id];
  } catch (e) { return []; }
}

// Menyu mesajı: HƏMİŞƏ eyni mesaj redaktə olunur (yeni mesaj yığılmır).
//  - "message is not modified" olduqda yeni mesaj göndərilmir
//  - redaktə mümkün olmasa yeni mesaj göndərilir və köhnə menyu silinir
//  - hər çat üçün əməliyyatlar növbəyə düzülür (sürətli basanda iki mesaj yaranmır)
//  - noBack:true olmayan hər menyuya avtomatik "Ana Menyu" düyməsi əlavə olunur
const chatQueues = {};
function sendOrUpdate(chatId, text, options = {}) {
  const prev = chatQueues[chatId] || Promise.resolve();
  const run = prev.catch(() => {}).then(() => _sendOrUpdate(chatId, text, options));
  chatQueues[chatId] = run.catch(() => {});
  return run;
}
function addBackRow(chatId, opts) {
  const lang = cachedLang(chatId);
  const backRow = [{ text: t('back_main', lang), callback_data: 'back_to_main' }];
  const kb = opts.reply_markup && opts.reply_markup.inline_keyboard;
  if (!Array.isArray(kb)) { opts.reply_markup = { inline_keyboard: [backRow] }; return; }
  const has = kb.some(row => row.some(btn => btn.callback_data === 'back_to_main' || btn.callback_data === 'cancel_operation'));
  if (has) return;
  opts.reply_markup = { ...opts.reply_markup, inline_keyboard: [...kb, backRow] };
}
function tgErr(e) { return String((e && e.response && e.response.body && e.response.body.description) || (e && e.message) || ''); }
async function _sendOrUpdate(chatId, text, options) {
  const { noBack, ...opts } = options;
  if (!noBack) addBackRow(chatId, opts);
  const msgId = mainMsgIds[chatId];
  if (msgId) {
    try {
      await bot.editMessageText(text, { chat_id: chatId, message_id: msgId, ...opts });
      return;
    } catch (e) {
      const d = tgErr(e);
      if (/message is not modified/i.test(d)) return;
      if (/can't parse entities/i.test(d) && opts.parse_mode) {
        try {
          const o2 = { ...opts }; delete o2.parse_mode;
          await bot.editMessageText(String(text).replace(/[_*`\[\]]/g, ''), { chat_id: chatId, message_id: msgId, ...o2 });
          return;
        } catch (e2) { /* aşağıda yeni mesaj */ }
      }
    }
  }
  let sent;
  try { sent = await bot.sendMessage(chatId, text, opts); }
  catch (e) {
    if (/can't parse entities/i.test(tgErr(e)) && opts.parse_mode) {
      const o2 = { ...opts }; delete o2.parse_mode;
      sent = await bot.sendMessage(chatId, String(text).replace(/[_*`\[\]]/g, ''), o2);
    } else throw e;
  }
  const oldId = mainMsgIds[chatId];
  mainMsgIds[chatId] = sent.message_id;
  if (oldId && oldId !== sent.message_id) bot.deleteMessage(chatId, oldId).catch(() => {});
}

// ============ ORTAQ CLIENT MENECERİ ============
// Eyni session üçün YALNIZ BİR bağlantı (həm mesaj göndərmə, həm avtocavab).
// İki paralel bağlantı AUTH_KEY_DUPLICATED xətasına və avtocavabın dayanmasına səbəb olurdu.
global.clients = global.clients || {};
global.clientLocks = global.clientLocks || {};
global.replyLocks = global.replyLocks || new Set();
global.autoReplyLast = global.autoReplyLast || {};
global.arCfgCache = global.arCfgCache || {};

function withLock(key, fn) {
  const prev = global.clientLocks[key] || Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  global.clientLocks[key] = run.catch(() => {});
  return run;
}

async function killClient(key) {
  const e = global.clients[key];
  if (!e) return;
  delete global.clients[key];
  try { await withTimeout(e.client.disconnect(), 8000, 'Disconnect'); } catch (err) {}
  try { if (e.client.destroy) await withTimeout(e.client.destroy(), 5000, 'Destroy'); } catch (err) {}
}

async function getSharedClient(key, session) {
  return withLock(key, async () => {
    let e = global.clients[key];
    if (e) {
      try { await withTimeout(e.client.connect(), 20000, 'Reconnect'); return e; }
      catch (err) { await killClient(key); }
    }
    const client = new TelegramClient(new StringSession(session), API_ID, API_HASH, { connectionRetries: 5, autoReconnect: true });
    await withTimeout(client.connect(), 30000, 'Connect');
    e = { client, handler: null, builder: null, autoReply: false, selfId: null, isPremium: false, dialogsAt: 0 };
    try {
      const me = await client.getMe();
      e.selfId = me?.id?.toString() || null;
      e.isPremium = !!me?.premium;
    } catch (err) {}
    global.clients[key] = e;
    return e;
  });
}

async function releaseSharedClient(key) {
  return withLock(key, async () => {
    const e = global.clients[key];
    if (!e) return;
    if (e.autoReply) return; // avtocavab üçün açıq qalır
    await killClient(key);
  });
}

// ============ AVTOCAVAB ============
async function getAutoReplyConfig(chatId) {
  const c = global.arCfgCache[chatId];
  if (c && Date.now() - c.at < 5000) return c.val;
  const [enabled, message, entities, activeLicense, cooldownDays] = await Promise.all([
    getDB(`users/${chatId}/autoReplyEnabled`), getDB(`users/${chatId}/autoReplyMessage`),
    getDB(`users/${chatId}/autoReplyEntities`), getDB(`users/${chatId}/activeLicense`),
    getDB('settings/autoReplyCooldownDays')
  ]);
  let val = null;
  if (enabled && message) {
    let ok = true;
    if (activeLicense) {
      const lic = await getLicense(activeLicense);
      if (lic && !isLicenseCurrentlyValid(lic)) ok = false;
    }
    if (ok) {
      const days = Math.max(1, parseInt(cooldownDays) || DEFAULT_AUTOREPLY_COOLDOWN_DAYS);
      val = { message, entities: botEntitiesToGram(entities), cooldownMs: days * 86400000 };
    }
  }
  global.arCfgCache[chatId] = { at: Date.now(), val };
  return val;
}

global.arDiag = global.arDiag || {};
function arDiag(key) {
  return (global.arDiag[key] = global.arDiag[key] || { events: 0, replies: 0, polls: 0, lastEventAt: 0, lastReplyAt: 0, lastError: '', lastSkip: '' });
}

// Avtocavabın ümumi məntiqi (həm canlı hadisə, həm də "polling" ehtiyat yolu bunu çağırır)
async function tryAutoReply(e, chatId, phone, key, { senderId, peer, via }) {
  const d = arDiag(key);
  if (!senderId || senderId === e.selfId || senderId === '777000') return;
  const lockKey = `${key}_${senderId}`;
  if (global.replyLocks.has(lockKey)) return;
  global.replyLocks.add(lockKey);
  const memKey = `${phone}_${senderId}`;
  const lastKey = `${chatId}_${memKey}`;
  let marked = false;
  try {
    const cfg = await getAutoReplyConfig(chatId);
    if (!cfg) { d.lastSkip = 'avtocavab söndürülüb / mətn yoxdur / lisenziya bitib'; return; }

    let lastAt = global.autoReplyLast[lastKey] || 0;
    if (!lastAt) {
      lastAt = (await getDB(`autoReplyCooldowns/${chatId}/${memKey}`)) || 0;
      if (lastAt) global.autoReplyLast[lastKey] = lastAt;
    }
    if (lastAt && Date.now() - lastAt < cfg.cooldownMs) { d.lastSkip = `cooldown (${senderId})`; return; }

    global.autoReplyLast[lastKey] = Date.now(); marked = true;
    await new Promise(res => setTimeout(res, 300 + Math.random() * 600));
    await e.client.sendMessage(peer, { message: cfg.message, formattingEntities: cfg.entities });
    await setDB(`autoReplyCooldowns/${chatId}/${memKey}`, Date.now());
    d.replies++; d.lastReplyAt = Date.now(); d.lastSkip = '';
    marked = false;
    console.log(`AutoReply ✓ ${key} → ${senderId} (${via})`);
    try { await e.client.invoke(new Api.messages.ReadHistory({ peer, maxId: 0 })); } catch (er) {}
  } catch (err) {
    if (marked) delete global.autoReplyLast[lastKey];
    d.lastError = `${new Date().toLocaleTimeString('az-AZ')} ${err.message}`;
    console.error(`AutoReply ✗ ${key}:`, err.message);
  } finally { global.replyLocks.delete(lockKey); }
}

// Ehtiyat yol: hadisə gəlməsə belə, son 2 saatda gələn cavabsız şəxsi mesajlara cavab verir (20 san-də bir yoxlama)
async function pollAutoReply(key, e) {
  const d = arDiag(key);
  d.polls++;
  const cfg = await getAutoReplyConfig(e.chatId);
  if (!cfg) return;
  const dialogs = await withTimeout(e.client.getDialogs({ limit: 25 }), 20000, 'Poll');
  for (const dlg of dialogs || []) {
    try {
      if (!dlg.isUser) continue;
      const m = dlg.message;
      if (!m || m.out) continue;
      if (dlg.entity?.bot || dlg.entity?.self) continue;
      if (Date.now() / 1000 - (m.date || 0) > 2 * 3600) continue;
      const senderId = String(dlg.entity?.id ?? m.peerId?.userId ?? '');
      await tryAutoReply(e, e.chatId, e.phone, key, { senderId, peer: dlg.inputEntity || dlg.entity, via: 'poll' });
    } catch (err) { d.lastError = err.message; }
  }
}

async function ensureAutoReplyClient(chatId, phone, acc, user) {
  const key = `${chatId}_${phone}`;
  if (global.autoReplyStarting.has(key)) return;
  if (!acc?.telegramSession) return;
  if (!user?.autoReplyEnabled || !user?.autoReplyMessage) return;
  const existing = global.clients[key];
  if (existing?.autoReply && existing.handler) return;
  global.autoReplyStarting.add(key);
  try {
    const e = await getSharedClient(key, acc.telegramSession);
    e.chatId = chatId; e.phone = phone;
    if (!e.handler) {
      const client = e.client;
      if (Date.now() - e.dialogsAt > 30 * 60 * 1000) {
        await client.getDialogs({ limit: 50 }).catch(() => {});
        e.dialogsAt = Date.now();
      }
      const handler = async (event) => {
        const d = arDiag(key);
        d.events++; d.lastEventAt = Date.now();
        try {
          const msg = event.message;
          if (!msg || msg.out) return;
          const peerId = msg.peerId;
          if (!peerId || peerId.className !== 'PeerUser') { d.lastSkip = 'şəxsi mesaj deyil'; return; }
          const senderId = peerId.userId?.toString();
          let sender = null;
          try { sender = await msg.getSender(); } catch (er) {}
          if (sender?.bot) { d.lastSkip = 'göndərən bot'; return; }
          let peer = peerId;
          try { const inp = await msg.getInputChat(); if (inp) peer = inp; } catch (er) {}
          console.log(`AutoReply event: ${key} ← ${senderId}`);
          await tryAutoReply(e, chatId, phone, key, { senderId, peer, via: 'event' });
        } catch (err) { d.lastError = err.message; console.error('AutoReply handler:', err.message); }
      };
      const builder = new NewMessage({});
      client.addEventHandler(handler, builder);
      e.handler = handler; e.builder = builder;
      if (typeof client.catchUp === 'function') client.catchUp().catch(() => {});
    }
    e.autoReply = true;
    console.log(`AutoReply client started: ${key} (premium=${e.isPremium})`);
  } catch (err) {
    arDiag(key).lastError = err.message;
    console.error('AutoReply start:', err.message);
    await killClient(key);
  } finally { global.autoReplyStarting.delete(key); }
}

async function stopAutoReplyClient(chatId, phone) {
  const key = `${chatId}_${phone}`;
  const e = global.clients[key];
  if (!e) return;
  try { if (e.handler) e.client.removeEventHandler(e.handler, e.builder); } catch (err) {}
  e.handler = null; e.builder = null; e.autoReply = false;
  if (!global.runningAccounts.has(key)) await killClient(key);
  console.log(`AutoReply stopped: ${key}`);
}

// Ehtiyat polling
setInterval(async () => {
  for (const key of Object.keys(global.clients)) {
    const e = global.clients[key];
    if (!e || !e.autoReply || !e.chatId) continue;
    if (global.runningAccounts.has(key)) continue; // göndərmə zamanı poll yükü yaratmasın
    try { await pollAutoReply(key, e); } catch (err) { arDiag(key).lastError = 'poll: ' + err.message; }
  }
}, 45000);

// Sinxronizasiya: avtocavab aktivdirsə client həmişə açıq olmalıdır
setInterval(async () => {
  try {
    const users = await getUsersSnap(20000);
    if (!users) return;
    for (const chatId in users) {
      const user = users[chatId];
      if (!user || !user.accounts) continue;
      let licenseOk = true;
      if (user.activeLicense) {
        const lic = await getLicense(user.activeLicense);
        licenseOk = isLicenseCurrentlyValid(lic);
      }
      for (const phone in user.accounts) {
        const acc = user.accounts[phone];
        const key = `${chatId}_${phone}`;
        const shouldRun = licenseOk && user.autoReplyEnabled && user.autoReplyMessage && acc.telegramSession;
        const e = global.clients[key];
        if (shouldRun && !(e?.autoReply && e.handler) && !global.autoReplyStarting.has(key)) {
          ensureAutoReplyClient(chatId, phone, acc, user);
        } else if (!shouldRun && e?.autoReply) {
          stopAutoReplyClient(chatId, phone);
        }
      }
    }
  } catch (e) { console.error('AutoReply sync:', e.message); }
}, 15000);

// Watchdog: bağlantı qopubsa client sıfırlanır, sinxronizasiya yenidən qaldırır
setInterval(async () => {
  for (const key of Object.keys(global.clients)) {
    const e = global.clients[key];
    if (!e || !e.autoReply) continue;
    try {
      await withTimeout(e.client.invoke(new Api.updates.GetState()), 15000, 'Ping');
    } catch (err) {
      console.log(`Watchdog: ${key} bağlantısı qopub, yenilənir (${err.message})`);
      if (!global.runningAccounts.has(key)) await killClient(key);
    }
  }
}, 60000);

// ============ LİSENZİYA BİLDİRİŞLƏRİ ============
setInterval(async () => {
  try {
    const licenses = await getDB('licenses');
    if (!licenses) return;
    for (const code in licenses) {
      const lic = licenses[code];
      if (!lic || !lic.usedBy) continue;
      if (lic.active === false || lic.frozen === true) continue;
      const expiry = getLicenseExpiryMs(lic);
      if (!expiry) continue;
      const daysLeft = Math.ceil((expiry - Date.now()) / (1000 * 60 * 60 * 24));
      const notified = lic.notified || {};
      const thresholds = [10, 5, 3, 1, 0];
      for (const th of thresholds) {
        if (daysLeft <= th && !notified[`d${th}`] && daysLeft >= 0) {
          const chatId = lic.usedBy;
          const user = await getDB(`users/${chatId}`) || {};
          const lang = user.lang || 'az';
          let msg;
          if (th === 0) msg = `⚠️ Lisenziyanız bu gün bitir! Dərhal yeniləyin.`;
          else msg = `⚠️ Lisenziyanızın bitməsinə ${th} gün qalıb.\n\nYeniləmək üçün: ${SUPPORT_URL}`;
          try {
            await bot.sendMessage(chatId, msg, {
              reply_markup: { inline_keyboard: [[{ text: t('btn_renew_lic', lang), url: SUPPORT_URL }]] }
            });
            notified[`d${th}`] = true;
            await setDB(`licenses/${code}/notified`, notified);
          } catch (e) {}
        }
      }
    }
  } catch (e) { console.error('Notification job:', e.message); }
}, 60 * 60 * 1000); // hourly

// ============ MAIN MENU ============
async function showMainMenu(chatId) {
  const [lang, activeLicense, fullBotActive] = await Promise.all([
    getLang(chatId), getDB(`users/${chatId}/activeLicense`), getDB(`users/${chatId}/fullBotActive`)
  ]);
  const user = { activeLicense, fullBotActive };
  let licActive = false, licExpText = "", isFrozen = false;

  if (user?.activeLicense) {
    const lic = await getDB(`licenses/${user.activeLicense}`);
    if (lic) {
      let expiry = lic.expireTimestamp || lic.expiresAt || lic.expireDate;
      if (!expiry && lic.durationDays) {
        expiry = Date.now() + (parseInt(lic.durationDays) * 24 * 60 * 60 * 1000);
        await setDB(`licenses/${user.activeLicense}/expireTimestamp`, expiry);
      }
      isFrozen = lic.frozen === true;
      const time = getLicenseExpiryMs({ expireTimestamp: expiry });
      if (!isFrozen && (!time || isNaN(time) || time > Date.now())) {
        licActive = lic.active !== false;
        if (time && !isNaN(time)) {
          const days = Math.ceil((time - Date.now()) / (1000 * 60 * 60 * 24));
          const expDateStr = new Date(time).toLocaleDateString('az-AZ');
          licExpText = ` (Bitmə: ${expDateStr} | Qalan: ${days} gün)`;
        }
      }
    }
  }

  const keyboard = [];
  if (!licActive) {
    const hadLicense = !!user?.activeLicense;
    if (hadLicense) keyboard.push([{ text: t('btn_renew_lic', lang), url: SUPPORT_URL }]);
    keyboard.push([
      { text: t('btn_act_lic', lang), callback_data: 'enter_license' },
      { text: t('btn_buy_lic', lang), url: SUPPORT_URL }
    ]);
    keyboard.push([
      { text: t('btn_price', lang), url: 'https://t.me/EliteBotMedia' },
      { text: t('btn_web', lang), url: 'https://EliteBot.com' }
    ]);
    keyboard.push([{ text: '💬 WhatsApp Dəstək', url: 'https://wa.me/19048477074' }]);
    keyboard.push([{ text: '📩 Dəstək (Telegram)', url: SUPPORT_URL }]);
  } else {
    keyboard.push([
      { text: t('btn_add_num', lang), callback_data: 'add_new_number' },
      { text: t('btn_manage', lang), callback_data: 'manage_numbers' }
    ]);
    keyboard.push([
      { text: t('btn_library', lang), callback_data: 'library_menu' },
      { text: t('btn_stats', lang), callback_data: 'stats_menu' }
    ]);
    keyboard.push([
      { text: t('auto_reply_btn', lang), callback_data: 'auto_reply_menu' },
      { text: t('btn_price', lang), url: 'https://t.me/EliteBotMedia' }
    ]);
    keyboard.push([
      { text: '🔑 Lisenziya', callback_data: 'lic_info' },
      { text: t('btn_web', lang), url: 'https://EliteBot.com' }
    ]);
    keyboard.push([{ text: user?.fullBotActive ? '⏹ Tam Botu Dayandır' : '🚀 Tam Botu Başlat', callback_data: 'start_full_bot' }]);
    keyboard.push([{ text: '💬 WhatsApp Dəstək', url: 'https://wa.me/19048477074' }]);
    keyboard.push([{ text: '📩 Dəstək (Telegram)', url: SUPPORT_URL }]);
  }
  const allBotsUrl = (await getDB('settings/allBotsUrl')) || ALL_BOTS_URL;
  keyboard.push([{ text: t('btn_all_bots', lang), url: allBotsUrl }]);

  const baseAboutText = t('about', lang);
  let header = '';
  if (licActive) header = `✅ Lisenziya Aktivdir!${licExpText}\n\n`;
  else if (isFrozen) header = `❄️ Lisenziya dondurulub.\n\n`;
  const finalAbout = header + baseAboutText;
  await sendOrUpdate(chatId, finalAbout, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard }, noBack: true });
}

async function isSubscribed(userId) {
  const [c2, c3] = await Promise.all([getDB('settings/channel2_id'), getDB('settings/channel3_id')]);
  const channels = [c2, c3].filter(Boolean);
  if (channels.length === 0) return true;
  for (const ch of channels) {
    try {
      const member = await bot.getChatMember(ch.trim(), userId);
      if (!['member', 'administrator', 'creator'].includes(member.status)) return false;
    } catch (e) { return false; }
  }
  return true;
}
function escapeMarkdown(text) {
  if (text === undefined || text === null) return '';
  return String(text).replace(/([_*`\[\]])/g, '\\$1');
}
async function resolveEntity(client, raw) {
  let input = String(raw).trim();
  if (input.startsWith('chat:')) { return input.split(' - ')[0].slice(5); }
  input = input.replace(/^https?:\/\/(t\.me|telegram\.me)\//i, '').replace(/^@/, '');
  if (input.startsWith('+')) {
    try {
      const res = await client.invoke(new Api.messages.ImportChatInvite({ hash: input.slice(1) }));
      if (res.chats?.length) return res.chats[0].id.toString();
    } catch (e) {
      if (e.message?.includes('USER_ALREADY_PARTICIPANT')) {
        const info = await client.invoke(new Api.messages.CheckChatInvite({ hash: input.slice(1) }));
        return (info.chat || info.chats?.[0])?.id.toString();
      }
    }
  }
  return input;
}

// ============ BOT START ============
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  // köhnə menyu və /start mesajı silinir -> çatda yığılma olmur
  bot.deleteMessage(chatId, msg.message_id).catch(() => {});
  const oldMenu = mainMsgIds[chatId];
  if (oldMenu) bot.deleteMessage(chatId, oldMenu).catch(() => {});
  mainMsgIds[chatId] = undefined;
  cleanupSession(chatId);
  await setDB(`users/${chatId}/state`, 'START');
  saveUserProfile(chatId, msg.from).catch(() => {});
  const keyboard = {
    inline_keyboard: [
      [{ text: '🇦🇿 Azərbaycan', callback_data: 'lang_az' }, { text: '🇹🇷 Türkçe', callback_data: 'lang_tr' }],
      [{ text: '🇬🇧 English', callback_data: 'lang_en' }, { text: '🇷🇺 Русский', callback_data: 'lang_ru' }]
    ]
  };
  const sent = await bot.sendMessage(chatId, 'Dil seçin / Select language:', { reply_markup: keyboard });
  mainMsgIds[chatId] = sent.message_id;
});

// ============ CALLBACK ============
bot.on('callback_query', (query) => {
  onCallback(query).catch(e => console.error('Callback xətası:', e && e.message));
});

async function onCallback(query) {
  const internal = !!query.internal;
  const chatId = (query.message && query.message.chat && query.message.chat.id) || (query.from && query.from.id);
  const data = query.data || '';
  // Düyməyə DƏRHAL cavab (DB-ni gözləmədən) -> "query is too old" xətası və donma yoxdur
  if (!internal) bot.answerCallbackQuery(query.id).catch(() => {});
  const lang = await getLang(chatId);

  if (data.startsWith('bc_open_')) { await handleBroadcastOpen(query, lang); return; }

  // Basılan düymənin olduğu mesaj həmişə aktiv menyu mesajı olur (restartdan sonra da yeni mesaj yaranmır)
  if (!internal && query.message && query.message.message_id) mainMsgIds[chatId] = query.message.message_id;
  if (!internal && query.from) {
    const last = global.profileSavedAt[chatId] || 0;
    if (Date.now() - last > 30 * 60 * 1000) { global.profileSavedAt[chatId] = Date.now(); saveUserProfile(chatId, query.from).catch(() => {}); }
  }

  if (data.startsWith('lang_') || data === 'check_sub') {
    let newLang = lang;
    if (data.startsWith('lang_')) { newLang = data.split('_')[1]; setLangCache(chatId, newLang); await setDB(`users/${chatId}/lang`, newLang); }
    if (data === 'check_sub') {
      const wait = await bot.sendMessage(chatId, t('checking', newLang));
      const ok = await isSubscribed(query.from.id);
      await bot.deleteMessage(chatId, wait.message_id).catch(() => {});
      if (ok) { await showMainMenu(chatId); return; }
    }
    const settings = { channel2: await getDB('settings/channel2') };
    const keyboard = {
      inline_keyboard: [
        [{ text: t('ch1_btn', newLang), url: settings.channel2 || 'https://t.me/EliteBotMedia' }],
        [{ text: t('ch2_btn', newLang), url: 'https://t.me/+1MsfqoAHmaQ1ZTli' }],
        [{ text: t('sub_btn', newLang), callback_data: 'check_sub' }]
      ]
    };
    const txt = data === 'check_sub' ? t('not_subscribed', newLang) : t('sub_msg', newLang);
    await sendOrUpdate(chatId, txt, { reply_markup: keyboard, noBack: true });
    return;
  }

  if (data === 'back_to_main' || data === 'cancel_operation') {
    cleanupSession(chatId);
    await setDB(`users/${chatId}/state`, 'IDLE');
    await showMainMenu(chatId);
    return;
  }

  // ===== LICENSE INFO =====
  if (data === 'lic_info') {
    const activeLicenseCode = await getDB(`users/${chatId}/activeLicense`);
    if (!activeLicenseCode) {
      await sendOrUpdate(chatId, t('no_lic', lang), { reply_markup: { inline_keyboard: [[{ text: t('back_main', lang), callback_data: 'back_to_main' }]] } });
      return;
    }
    const lic = await getDB(`licenses/${activeLicenseCode}`);
    if (!lic) {
      await sendOrUpdate(chatId, t('not_found_lic', lang), { reply_markup: { inline_keyboard: [[{ text: t('back_main', lang), callback_data: 'back_to_main' }]] } });
      return;
    }
    const expiry = getLicenseExpiryMs(lic);
    const created = lic.dateCreated || '—';
    let expStr = '—', daysLeft = '—';
    if (expiry) {
      expStr = new Date(expiry).toLocaleString('az-AZ');
      daysLeft = Math.max(0, Math.ceil((expiry - Date.now()) / (1000 * 60 * 60 * 24)));
    }
    const maxAcc = (lic.maxAccounts || 0) + (lic.bonusAccounts || 0);
    const frozen = lic.frozen ? '\n❄️ *VƏZİYYƏT: DONDURULUB*' : '';
    const txt = `${t('lic_info_title', lang)}${frozen}\n\n` +
      `🔑 ${t('lic_code', lang)}: \`${lic.code}\`\n` +
      `📅 ${t('lic_start', lang)}: ${created}\n` +
      `⏳ ${t('lic_end', lang)}: ${expStr}\n` +
      `📊 ${t('lic_days_left', lang)}: ${daysLeft} gün\n` +
      `👥 ${t('lic_max_acc', lang)}: ${maxAcc}`;
    await sendOrUpdate(chatId, txt, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: t('back_main', lang), callback_data: 'back_to_main' }]] } });
    return;
  }

  if (data === 'enter_license') {
    await setDB(`users/${chatId}/state`, 'AWAITING_LICENSE');
    const keyboard = { inline_keyboard: [[{ text: t('cancel_btn', lang), callback_data: 'cancel_operation' }]] };
    await sendOrUpdate(chatId, t('enter_lic', lang), { reply_markup: keyboard });
    return;
  }

  if (data === 'add_new_number') {
    const userData = await getUserFields(chatId, ['activeLicense', 'accounts']);
    if (!userData?.activeLicense) {
      await sendOrUpdate(chatId, t('no_lic', lang), { reply_markup: { inline_keyboard: [[{ text: t('back_main', lang), callback_data: 'back_to_main' }]] } });
      return;
    }
    const lic = await getDB(`licenses/${userData.activeLicense}`);
    if (!isLicenseCurrentlyValid(lic)) {
      await sendOrUpdate(chatId, t('blocked_lic', lang), { reply_markup: { inline_keyboard: [[{ text: t('back_main', lang), callback_data: 'back_to_main' }]] } });
      return;
    }
    const count = userData.accounts ? Object.keys(userData.accounts).length : 0;
    const maxAcc = (lic.maxAccounts || 0) + (lic.bonusAccounts || 0);
    if (count >= maxAcc) {
      await sendOrUpdate(chatId, t('limit_reached', lang, { max: maxAcc }), { reply_markup: { inline_keyboard: [[{ text: t('back_main', lang), callback_data: 'back_to_main' }]] } });
      return;
    }
    await setDB(`users/${chatId}/state`, 'AWAITING_PHONE');
    const keyboard = { inline_keyboard: [[{ text: t('cancel_btn', lang), callback_data: 'cancel_operation' }]] };
    await sendOrUpdate(chatId, t('enter_phone', lang), { reply_markup: keyboard });
    return;
  }

  if (data === 'manage_numbers') {
    const userData = await getUserFields(chatId, ['accounts']);
    if (!userData?.accounts || Object.keys(userData.accounts).length === 0) {
      await sendOrUpdate(chatId, t('no_numbers', lang), { reply_markup: { inline_keyboard: [[{ text: t('back_main', lang), callback_data: 'back_to_main' }]] } });
      return;
    }
    let msg = t('my_accounts', lang);
    const kb = [];
    for (const phone in userData.accounts) {
      const acc = userData.accounts[phone];
      const status = acc.status === 'ACTIVE' ? t('active', lang) : t('stopped', lang);
      let src = '💾 Saved';
      if (acc.messageSource?.type === 'custom') src = `📌 ${acc.messageSource.target}`;
      else if (acc.messageSource?.type === 'library') src = `📚 ${acc.messageSource.name || 'Library'}`;
      const intSec = acc.intervalSeconds || 120;
      msg += `📱 +${phone}\n⏳ İnterval: ${intSec}s\n📥 Mənbə: ${src}\n📊 ${status}\n\n`;
      kb.push([
        { text: t('groups_btn', lang), callback_data: `groups_${phone}` },
        { text: t('source_btn', lang), callback_data: `source_${phone}` }
      ]);
      kb.push([
        { text: t('scan_btn', lang), callback_data: `scan_${phone}` },
        { text: t('change_interval_btn', lang), callback_data: `chint_${phone}` }
      ]);
      kb.push([
        { text: acc.status === 'ACTIVE' ? t('stop_btn', lang) : t('resume_btn', lang), callback_data: `toggle_${phone}` },
        { text: t('delete_btn', lang), callback_data: `delete_${phone}` }
      ]);
    }
    kb.push([{ text: t('back_main', lang), callback_data: 'back_to_main' }]);
    await sendOrUpdate(chatId, msg, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: kb } });
    return;
  }

  // ===== LIBRARY =====
  if (data === 'library_menu') {
    const lib = await getDB(`users/${chatId}/library/sources`) || {};
    const sources = Object.entries(lib);
    let msg = t('lib_title', lang) + '\n\n';
    const kb = [];
    if (sources.length === 0) msg += t('lib_empty', lang);
    else sources.slice(0, 30).forEach(([id, s]) => {
      const icon = s.contentType === 'photo' ? '🖼' : s.contentType === 'video' ? '🎬' : '📝';
      msg += `${icon} ${escapeMarkdown(s.name)}\n`;
      kb.push([{ text: `${icon} ${s.name}`, callback_data: `lib_view_${id}` }]);
    });
    kb.push([{ text: t('lib_new', lang), callback_data: 'lib_new' }]);
    kb.push([{ text: t('back_main', lang), callback_data: 'back_to_main' }]);
    await sendOrUpdate(chatId, msg, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: kb } });
    return;
  }

  if (data === 'lib_new') {
    await setDB(`users/${chatId}/state`, 'AWAITING_LIB_NAME');
    const kb = { inline_keyboard: [[{ text: t('cancel_btn', lang), callback_data: 'cancel_operation' }]] };
    await sendOrUpdate(chatId, t('lib_new_name', lang), { reply_markup: kb });
    return;
  }

  if (data.startsWith('lib_view_')) {
    const id = data.replace('lib_view_', '');
    const src = await getDB(`users/${chatId}/library/sources/${id}`);
    if (!src) { await showMainMenu(chatId); return; }
    const icon = src.contentType === 'photo' ? '🖼' : src.contentType === 'video' ? '🎬' : '📝';
    let contentPreview = '';
    if (src.contentType === 'text') contentPreview = (src.text || '').substring(0, 200);
    else contentPreview = (src.caption || '').substring(0, 200);
    const msg = t('lib_view_title', lang, { name: src.name, type: icon + ' ' + src.contentType, content: contentPreview });
    const kb = [
      [{ text: t('lib_use', lang), callback_data: `lib_use_${id}` }],
      [{ text: t('lib_delete', lang), callback_data: `lib_del_${id}` }],
      [{ text: t('back_btn', lang), callback_data: 'library_menu' }]
    ];
    await sendOrUpdate(chatId, msg, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: kb } });
    return;
  }

  if (data.startsWith('lib_del_')) {
    const id = data.replace('lib_del_', '');
    const src = await getDB(`users/${chatId}/library/sources/${id}`);
    if (!src) { await showMainMenu(chatId); return; }
    const kb = {
      inline_keyboard: [
        [{ text: '✅ Bəli', callback_data: `lib_delok_${id}` }],
        [{ text: '❌ Xeyr', callback_data: 'library_menu' }]
      ]
    };
    await sendOrUpdate(chatId, t('lib_confirm_delete', lang, { name: src.name }), { reply_markup: kb });
    return;
  }

  if (data.startsWith('lib_delok_')) {
    const id = data.replace('lib_delok_', '');
    await setDB(`users/${chatId}/library/sources/${id}`, null);
    bot.sendMessage(chatId, t('lib_deleted', lang)).then(m => setTimeout(() => bot.deleteMessage(chatId, m.message_id).catch(() => {}), 3000));
    await onCallback({ message: query.message, data: 'library_menu', id: query.id, from: query.from, internal: true });
    return;
  }

  if (data.startsWith('lib_use_')) {
    // Ask which phone to use this source for
    const id = data.replace('lib_use_', '');
    const src = await getDB(`users/${chatId}/library/sources/${id}`);
    if (!src) { await showMainMenu(chatId); return; }
    const userData = await getUserFields(chatId, ['accounts']);
    if (!userData.accounts || Object.keys(userData.accounts).length === 0) {
      await sendOrUpdate(chatId, t('no_numbers', lang), { reply_markup: { inline_keyboard: [[{ text: t('back_main', lang), callback_data: 'back_to_main' }]] } });
      return;
    }
    const kb = [];
    for (const phone in userData.accounts) {
      kb.push([{ text: `📱 +${phone}`, callback_data: `lib_assign_${id}_${phone}` }]);
    }
    kb.push([{ text: t('back_btn', lang), callback_data: 'library_menu' }]);
    await sendOrUpdate(chatId, '📱 Hansı hesab üçün?', { reply_markup: { inline_keyboard: kb } });
    return;
  }

  if (data.startsWith('lib_assign_')) {
    const mm = data.match(/^lib_assign_(src_\d+_\d+)_(\d+)$/);
    if (!mm) { await showMainMenu(chatId); return; }
    const id = mm[1], phone = mm[2];
    const src = await getDB(`users/${chatId}/library/sources/${id}`);
    if (!src) { await showMainMenu(chatId); return; }
    await setDB(`users/${chatId}/accounts/${phone}/messageSource`, {
      type: 'library', sourceId: id, name: src.name
    });
    bot.sendMessage(chatId, t('lib_set_as_source', lang, { name: src.name })).then(m => setTimeout(() => bot.deleteMessage(chatId, m.message_id).catch(() => {}), 4000));
    await onCallback({ message: query.message, data: `source_${phone}`, id: query.id, from: query.from, internal: true });
    return;
  }

  // ===== STATS =====
  if (data === 'stats_menu') {
    const userData = await getUserFields(chatId, ['accounts']);
    if (!userData?.accounts || Object.keys(userData.accounts).length === 0) {
      await sendOrUpdate(chatId, t('stats_no_data', lang), { reply_markup: { inline_keyboard: [[{ text: t('back_main', lang), callback_data: 'back_to_main' }]] } });
      return;
    }
    let msg = t('stats_title', lang) + '\n\n';
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    for (const phone in userData.accounts) {
      const stats = await getDB(`stats/${chatId}/${phone}`) || {};
      let week = 0, month = 0;
      if (stats.daily) {
        for (const [d, c] of Object.entries(stats.daily)) {
          if (d >= weekAgo) week += c;
          if (d >= monthAgo) month += c;
        }
      }
      msg += `📱 *+${phone}*\n`;
      msg += `  ${t('stats_today', lang)}: ${stats.daily?.[today] || 0}\n`;
      msg += `  ${t('stats_week', lang)}: ${week}\n`;
      msg += `  ${t('stats_month', lang)}: ${month}\n`;
      msg += `  ${t('stats_total', lang)}: ${stats.total || 0}\n`;
      msg += `  ✅ ${stats.success || 0} | ❌ ${stats.failed || 0}\n\n`;
    }
    await sendOrUpdate(chatId, msg, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: t('back_main', lang), callback_data: 'back_to_main' }]] } });
    return;
  }

  if (data === 'auto_reply_menu') {
    const userData = await getUserFields(chatId, ['autoReplyEnabled', 'autoReplyMessage']);
    const enabled = userData.autoReplyEnabled || false;
    const txt = userData.autoReplyMessage || '—';
    const status = enabled ? t('auto_reply_on', lang) : t('auto_reply_off', lang);
    const toggleText = enabled ? t('auto_reply_toggle_off', lang) : t('auto_reply_toggle_on', lang);
    const toggleData = enabled ? 'auto_reply_disable' : 'auto_reply_enable';
    const kb = {
      inline_keyboard: [
        [{ text: '📝 Mesajı Dəyiş', callback_data: 'auto_reply_set' }],
        [{ text: toggleText, callback_data: toggleData }],
        [{ text: '🔧 Diaqnostika', callback_data: 'ar_diag' }, { text: '🧹 Cooldown sıfırla', callback_data: 'ar_reset_cd' }],
        [{ text: t('back_main', lang), callback_data: 'back_to_main' }]
      ]
    };
    await sendOrUpdate(chatId, `📩 *Avtomatik Cavab*\n\nStatus: ${status}\nMətn:\n${escapeMarkdown(txt)}`, { parse_mode: 'Markdown', reply_markup: kb });
    return;
  }
  if (data === 'ar_reset_cd') {
    await setDB(`autoReplyCooldowns/${chatId}`, null);
    await setDB(`users/${chatId}/autoReplyCooldowns`, null);
    for (const k of Object.keys(global.autoReplyLast)) if (k.startsWith(`${chatId}_`)) delete global.autoReplyLast[k];
    bot.sendMessage(chatId, '✅ Cooldown sıfırlandı. İndi eyni şəxs yenidən yazsa cavab alacaq.').then(m => setTimeout(() => bot.deleteMessage(chatId, m.message_id).catch(() => {}), 6000)).catch(() => {});
    return;
  }
  if (data === 'ar_diag') {
    const ud = await getUserFields(chatId, ['autoReplyEnabled', 'autoReplyMessage', 'accounts']);
    let txt = `🔧 Avtocavab diaqnostikası\nAktiv: ${ud.autoReplyEnabled ? 'Bəli' : 'Xeyr'} | Mətn: ${ud.autoReplyMessage ? 'var' : 'YOXDUR'}\n`;
    const days = (await getDB('settings/autoReplyCooldownDays')) || DEFAULT_AUTOREPLY_COOLDOWN_DAYS;
    txt += `Cooldown: ${days} gün (eyni şəxsə)\n\n`;
    for (const phone in (ud.accounts || {})) {
      const key = `${chatId}_${phone}`;
      const e = global.clients[key];
      const d = arDiag(key);
      const ago = (ts) => ts ? `${Math.round((Date.now() - ts) / 1000)} san əvvəl` : '—';
      txt += `📱 +${phone}\n  Bağlantı: ${e ? '🟢' : '🔴'} | Handler: ${e?.handler ? '✅' : '❌'} | Premium: ${e?.isPremium ? 'Bəli' : 'Xeyr'}\n  Gələn hadisə: ${d.events} (son: ${ago(d.lastEventAt)})\n  Cavab: ${d.replies} (son: ${ago(d.lastReplyAt)})\n  Yoxlama: ${d.polls}\n  Son atlama: ${d.lastSkip || '—'}\n  Son xəta: ${d.lastError || '—'}\n\n`;
    }
    await sendOrUpdate(chatId, txt, { reply_markup: { inline_keyboard: [[{ text: '🔄 Yenilə', callback_data: 'ar_diag' }], [{ text: t('back_btn', lang), callback_data: 'auto_reply_menu' }]] } });
    return;
  }
  if (data === 'auto_reply_set') {
    await setDB(`users/${chatId}/state`, 'AWAITING_AUTO_REPLY');
    const kb = { inline_keyboard: [[{ text: t('cancel_btn', lang), callback_data: 'cancel_operation' }]] };
    await sendOrUpdate(chatId, t('set_auto_reply', lang), { reply_markup: kb });
    return;
  }
  if (data === 'auto_reply_enable') {
    await setDB(`users/${chatId}/autoReplyEnabled`, true);
    const userData = await getDB(`users/${chatId}`) || {};
    if (userData.accounts && userData.autoReplyMessage) {
      for (const phone in userData.accounts) {
        ensureAutoReplyClient(chatId, phone, userData.accounts[phone], { ...userData, autoReplyEnabled: true });
      }
    }
    await sendOrUpdate(chatId, t('auto_reply_enabled', lang), { reply_markup: { inline_keyboard: [[{ text: t('back_main', lang), callback_data: 'back_to_main' }]] } });
    return;
  }
  if (data === 'auto_reply_disable') {
    await setDB(`users/${chatId}/autoReplyEnabled`, false);
    const userData = await getDB(`users/${chatId}`) || {};
    if (userData.accounts) for (const phone in userData.accounts) stopAutoReplyClient(chatId, phone);
    await sendOrUpdate(chatId, t('auto_reply_disabled', lang), { reply_markup: { inline_keyboard: [[{ text: t('back_main', lang), callback_data: 'back_to_main' }]] } });
    return;
  }

  if (data === 'start_full_bot') {
    const userData = await getDB(`users/${chatId}`) || {};
    const isCurrentlyActive = userData.fullBotActive || false;
    const newState = !isCurrentlyActive;
    if (!newState) requestAbortAll(chatId, userData.accounts);
    await setDB(`users/${chatId}/fullBotActive`, newState);
    await setDB(`users/${chatId}/autoReplyEnabled`, newState);
    if (userData.accounts) {
      for (const phone in userData.accounts) {
        if (newState) {
          clearAbort(chatId, phone);
          await activateAccount(chatId, phone);
          if (userData.autoReplyMessage) {
            ensureAutoReplyClient(chatId, phone, userData.accounts[phone], { ...userData, autoReplyEnabled: true });
          }
        } else {
          requestAbort(chatId, phone);
          await setDB(`users/${chatId}/accounts/${phone}/status`, 'STOPPED');
          stopAutoReplyClient(chatId, phone);
        }
      }
    }
    const msgText = newState ? '🚀 Tam bot başladıldı!' : '⏹ Tam bot dayandırıldı.';
    bot.sendMessage(chatId, msgText).then(m => setTimeout(() => bot.deleteMessage(chatId, m.message_id).catch(() => {}), 5000));
    await showMainMenu(chatId);
    return;
  }

  if (data.startsWith('toggle_')) {
    const phone = data.replace('toggle_', '');
    const acc = await getDB(`users/${chatId}/accounts/${phone}`);
    if (acc) {
      const newStatus = acc.status === 'ACTIVE' ? 'STOPPED' : 'ACTIVE';
      if (newStatus === 'STOPPED') {
        requestAbort(chatId, phone);
        await setDB(`users/${chatId}/accounts/${phone}/status`, 'STOPPED');
      } else {
        clearAbort(chatId, phone);
        await activateAccount(chatId, phone);
        const userData = await getUserFields(chatId, ['autoReplyEnabled', 'autoReplyMessage']);
        if (userData.autoReplyEnabled && userData.autoReplyMessage) ensureAutoReplyClient(chatId, phone, acc, userData);
      }
      const msg = newStatus === 'STOPPED' ? t('stop_single', lang, { phone }) : t('resume_single', lang, { phone });
      bot.sendMessage(chatId, msg).then(m => setTimeout(() => bot.deleteMessage(chatId, m.message_id).catch(() => {}), 5000));
      await onCallback({ message: query.message, data: 'manage_numbers', id: query.id, from: query.from, internal: true });
    }
    return;
  }

  if (data.startsWith('delete_')) {
    const phone = data.replace('delete_', '');
    const kb = { inline_keyboard: [[
      { text: t('confirm_delete_num_yes', lang), callback_data: `delok_${phone}` },
      { text: t('confirm_delete_num_no', lang), callback_data: 'manage_numbers' }
    ]] };
    await sendOrUpdate(chatId, t('confirm_delete_num', lang, { phone }), { reply_markup: kb });
    return;
  }
  if (data.startsWith('delok_')) {
    const phone = data.replace('delok_', '');
    requestAbort(chatId, phone);
    await stopAutoReplyClient(chatId, phone);
    await killClient(accTaskKey(chatId, phone));
    const licCode = await getDB(`users/${chatId}/activeLicense`);
    await setDB(`users/${chatId}/accounts/${phone}`, null);
    if (licCode) {
      await setDB(`licenses/${licCode}/registeredPhones/${phone}`, null);
      syncLicenseUserInfo(chatId, licCode, query.from).catch(() => {});
    }
    delete global.localNextRun[accTaskKey(chatId, phone)];
    bot.sendMessage(chatId, t('num_deleted', lang, { phone })).then(m => setTimeout(() => bot.deleteMessage(chatId, m.message_id).catch(() => {}), 3000)).catch(() => {});
    await onCallback({ message: query.message, data: 'manage_numbers', id: query.id, from: query.from, internal: true });
    return;
  }

  if (data.startsWith('chint_')) {
    const phone = data.replace('chint_', '');
    await setDB(`users/${chatId}/state`, 'AWAITING_CHANGE_INTERVAL');
    await setDB(`users/${chatId}/changingIntervalPhone`, phone);
    const kb = { inline_keyboard: [[{ text: t('cancel_btn', lang), callback_data: 'cancel_operation' }]] };
    await sendOrUpdate(chatId, t('new_interval_prompt', lang), { reply_markup: kb });
    return;
  }

  if (data === 'source_saved') {
    const phone = await getDB(`users/${chatId}/currentPhoneSetup`);
    if (phone) {
      await setDB(`users/${chatId}/accounts/${phone}/messageSource`, { type: 'saved' });
      await setDB(`users/${chatId}/state`, 'AWAITING_INTERVAL');
      const kb = { inline_keyboard: [[{ text: t('cancel_btn', lang), callback_data: 'cancel_operation' }]] };
      await sendOrUpdate(chatId, t('ask_interval', lang), { reply_markup: kb });
    }
    return;
  }
  if (data === 'source_custom') {
    await setDB(`users/${chatId}/state`, 'AWAITING_CUSTOM_SOURCE');
    const kb = { inline_keyboard: [[{ text: t('cancel_btn', lang), callback_data: 'cancel_operation' }]] };
    await sendOrUpdate(chatId, t('enter_source', lang), { reply_markup: kb });
    return;
  }

  if (data.startsWith('scanselect_')) {
    const idx = parseInt(data.split('_')[1]);
    const session = userSessions[chatId];
    if (!session?.scanGroups) { await sendOrUpdate(chatId, t('session_expired', lang), { reply_markup: { inline_keyboard: [[{ text: t('back_main', lang), callback_data: 'back_to_main' }]] } }); return; }
    if (session.scanSelected.has(idx)) session.scanSelected.delete(idx); else session.scanSelected.add(idx);
    await sendScanPage(chatId);
    return;
  }
  if (data === 'scan_confirm') {
    const session = userSessions[chatId];
    if (!session?.scanGroups) { await sendOrUpdate(chatId, t('session_expired', lang), { reply_markup: { inline_keyboard: [[{ text: t('back_main', lang), callback_data: 'back_to_main' }]] } }); return; }
    const phone = session.scanPhone;
    const selected = Array.from(session.scanSelected).map(i => {
      const g = session.scanGroups[i];
      return g.username ? `@${g.username}` : `chat:${g.id} - ${g.title}`;
    });
    const existing = await getDB(`users/${chatId}/accounts/${phone}/targetGroups`) || [];
    const merged = [...new Set([...existing, ...selected])];
    await setDB(`users/${chatId}/accounts/${phone}/targetGroups`, merged);
    await setDB(`users/${chatId}/accounts/${phone}/status`, 'STOPPED');
    const acc = await getDB(`users/${chatId}/accounts/${phone}`);
    if (!acc.intervalSeconds && !acc.intervalMinutes) await setDB(`users/${chatId}/accounts/${phone}/intervalSeconds`, 120);
    delete userSessions[chatId];
    await sendOrUpdate(chatId, t('scan_done', lang, { count: selected.length }), { reply_markup: { inline_keyboard: [[{ text: t('back_main', lang), callback_data: 'back_to_main' }]] } });
    return;
  }
  if (data === 'scan_more') {
    if (!userSessions[chatId]) { await sendOrUpdate(chatId, t('session_expired', lang), { reply_markup: { inline_keyboard: [[{ text: t('back_main', lang), callback_data: 'back_to_main' }]] } }); return; }
    userSessions[chatId].scanPage++;
    await sendScanPage(chatId);
    return;
  }
  if (data === 'scan_back') {
    if (!userSessions[chatId]) { await sendOrUpdate(chatId, t('session_expired', lang), { reply_markup: { inline_keyboard: [[{ text: t('back_main', lang), callback_data: 'back_to_main' }]] } }); return; }
    userSessions[chatId].scanPage--;
    await sendScanPage(chatId);
    return;
  }
  if (data.startsWith('scan_')) {
    const phone = data.replace('scan_', '');
    const acc = await getDB(`users/${chatId}/accounts/${phone}`);
    if (!acc?.telegramSession) { await sendOrUpdate(chatId, t('no_numbers', lang), { reply_markup: { inline_keyboard: [[{ text: t('back_main', lang), callback_data: 'back_to_main' }]] } }); return; }
    const wait = await bot.sendMessage(chatId, t('scanning', lang));
    let client;
    try {
      client = new TelegramClient(new StringSession(acc.telegramSession), API_ID, API_HASH, { connectionRetries: 1 });
      await client.connect();
      const dialogs = await client.getDialogs({ limit: 500 });
      const groups = dialogs.filter(d => d.isGroup && !d.entity?.broadcast).map(d => ({
        id: (d.entity?.id ? d.entity.id.toString() : d.id.toString()),
        title: d.title || 'Bilinməyən',
        username: d.entity?.username || d.username || ''
      }));
      await bot.deleteMessage(chatId, wait.message_id).catch(() => {});
      if (groups.length === 0) { await sendOrUpdate(chatId, t('no_groups_found', lang), { reply_markup: { inline_keyboard: [[{ text: t('back_main', lang), callback_data: 'back_to_main' }]] } }); return; }
      const existingGroups = acc.targetGroups || [];
      const scanSelected = new Set();
      groups.forEach((g, index) => {
        const gStr = g.username ? `@${g.username}` : `chat:${g.id} - ${g.title}`;
        if (existingGroups.includes(gStr)) scanSelected.add(index);
      });
      userSessions[chatId] = { scanGroups: groups, scanSelected, scanPage: 0, scanPhone: phone };
      await sendScanPage(chatId);
    } catch (e) {
      await bot.deleteMessage(chatId, wait.message_id).catch(() => {});
      await sendOrUpdate(chatId, t('err', lang) + e.message, { reply_markup: { inline_keyboard: [[{ text: t('back_main', lang), callback_data: 'back_to_main' }]] } });
    } finally { if (client) try { await client.disconnect(); } catch (e) {} }
    return;
  }

  if (data.startsWith('groups_')) {
    const phone = data.replace('groups_', '');
    const acc = await getDB(`users/${chatId}/accounts/${phone}`);
    if (!acc) { await sendOrUpdate(chatId, t('no_numbers', lang), { reply_markup: { inline_keyboard: [[{ text: t('back_main', lang), callback_data: 'back_to_main' }]] } }); return; }
    const groups = acc.targetGroups || [];
    let msg = `📱 *+${phone}* üçün hədəf qruplar:\n\n`;
    const kb = [];
    if (groups.length === 0) msg += t('no_groups', lang);
    else {
      const displayGroups = groups.slice(0, 90);
      if (groups.length > 90) msg += `⚠️ Yalnız ilk 90 göstərilir.\n\n`;
      displayGroups.forEach((g, i) => {
        let display = g;
        if (g.startsWith('chat:')) { const parts = g.split(' - '); display = parts.length > 1 ? parts.slice(1).join(' - ') : parts[0]; }
        msg += `${i + 1}. ${escapeMarkdown(display)}\n`;
        const safeGroupName = Array.from(display || '').slice(0, 20).join('');
        kb.push([{ text: t('del_group_btn', lang, { group: safeGroupName }), callback_data: `delgroup_${phone}_${i}` }]);
      });
    }
    kb.push([{ text: t('add_group_btn', lang), callback_data: `addgroup_${phone}` }]);
    kb.push([{ text: t('back_btn', lang), callback_data: 'manage_numbers' }]);
    kb.push([{ text: t('back_main', lang), callback_data: 'back_to_main' }]);
    try { await sendOrUpdate(chatId, msg, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: kb } }); }
    catch (error) {
      try { delete mainMsgIds[chatId]; await sendOrUpdate(chatId, msg.replace(/[_*`\[\]]/g, ''), { reply_markup: { inline_keyboard: kb } }); } catch (e) {}
    }
    return;
  }
  if (data.startsWith('delgroup_')) {
    const parts = data.split('_');
    const phone = parts[1], idx = parseInt(parts[2]);
    const acc = await getDB(`users/${chatId}/accounts/${phone}`);
    if (acc?.targetGroups) {
      acc.targetGroups.splice(idx, 1);
      await setDB(`users/${chatId}/accounts/${phone}/targetGroups`, acc.targetGroups);
      bot.sendMessage(chatId, t('group_deleted', lang)).then(m => setTimeout(() => bot.deleteMessage(chatId, m.message_id).catch(() => {}), 3000));
      await onCallback({ message: query.message, data: `groups_${phone}`, id: query.id, from: query.from, internal: true });
    }
    return;
  }
  if (data.startsWith('addgroup_')) {
    const phone = data.replace('addgroup_', '');
    await setDB(`users/${chatId}/state`, 'AWAITING_GROUP');
    await setDB(`users/${chatId}/currentPhoneSetup`, phone);
    const kb = { inline_keyboard: [[{ text: t('cancel_btn', lang), callback_data: 'cancel_operation' }]] };
    await sendOrUpdate(chatId, t('send_group', lang), { parse_mode: 'Markdown', reply_markup: kb });
    return;
  }

  if (data.startsWith('fmode_')) {
    const phone = data.replace('fmode_', '');
    const acc = await getDB(`users/${chatId}/accounts/${phone}`);
    if (acc) {
      const order = ['auto', 'keep', 'hide'];
      const next = order[(order.indexOf(acc.forwardMode || 'auto') + 1) % 3];
      await setDB(`users/${chatId}/accounts/${phone}/forwardMode`, next);
      await onCallback({ message: query.message, data: `source_${phone}`, id: query.id, from: query.from, internal: true });
    }
    return;
  }

  if (data.startsWith('source_') && !['source_saved', 'source_custom', 'source_library'].includes(data)) {
    const phone = data.replace('source_', '');
    const acc = await getDB(`users/${chatId}/accounts/${phone}`);
    if (!acc) { await sendOrUpdate(chatId, t('no_numbers', lang), { reply_markup: { inline_keyboard: [[{ text: t('back_main', lang), callback_data: 'back_to_main' }]] } }); return; }
    const src = acc.messageSource;
    let msg = `📥 *+${phone}* mesaj mənbəyi:\n\n`;
    if (!src || src.type === 'saved') msg += '💾 Yadda saxlanmış mesajlar';
    else if (src.type === 'library') msg += `📚 Kitabxana: ${src.name || src.sourceId}`;
    else msg += `🔗 Xüsusi: ${src.target}`;
    const fm = acc.forwardMode || 'auto';
    msg += `\n\n🔁 Forward rejimi: ${fm === 'keep' ? 'Başlıqlı (premium emoji 100% qalır)' : fm === 'hide' ? 'Başlıqsız' : 'Avto'}`;
    const kb = [
      [{ text: '🔁 Forward rejimini dəyiş', callback_data: `fmode_${phone}` }],
      [{ text: t('del_source_btn', lang), callback_data: `delsource_${phone}` }],
      [{ text: t('change_source_btn', lang), callback_data: `changesource_${phone}` }],
      [{ text: t('back_btn', lang), callback_data: 'manage_numbers' }],
      [{ text: t('back_main', lang), callback_data: 'back_to_main' }]
    ];
    await sendOrUpdate(chatId, msg, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: kb } });
    return;
  }
  if (data.startsWith('delsource_')) {
    const phone = data.replace('delsource_', '');
    await setDB(`users/${chatId}/accounts/${phone}/messageSource`, { type: 'saved' });
    bot.sendMessage(chatId, t('source_deleted', lang)).then(m => setTimeout(() => bot.deleteMessage(chatId, m.message_id).catch(() => {}), 3000));
    await onCallback({ message: query.message, data: `source_${phone}`, id: query.id, from: query.from, internal: true });
    return;
  }
  if (data.startsWith('changesource_')) {
    const phone = data.replace('changesource_', '');
    await setDB(`users/${chatId}/currentPhoneSetup`, phone);
    await setDB(`users/${chatId}/state`, 'AWAITING_SOURCE');
    const kb = {
      inline_keyboard: [
        [{ text: t('source_saved_btn', lang), callback_data: 'source_saved' }],
        [{ text: t('source_library_btn', lang), callback_data: 'source_library' }],
        [{ text: t('source_custom_btn', lang), callback_data: 'source_custom' }],
        [{ text: t('cancel_btn', lang), callback_data: 'cancel_operation' }]
      ]
    };
    await sendOrUpdate(chatId, t('source_prompt', lang), { reply_markup: kb });
    return;
  }

  if (data === 'source_library') {
    const lib = await getDB(`users/${chatId}/library/sources`) || {};
    const sources = Object.entries(lib);
    if (sources.length === 0) {
      await sendOrUpdate(chatId, t('lib_empty', lang), { reply_markup: { inline_keyboard: [[{ text: t('lib_new', lang), callback_data: 'lib_new' }], [{ text: t('back_main', lang), callback_data: 'back_to_main' }]] } });
      return;
    }
    const phone = await getDB(`users/${chatId}/currentPhoneSetup`);
    const kb2 = [];
    sources.slice(0, 30).forEach(([id, s]) => {
      const icon = s.contentType === 'photo' ? '🖼' : s.contentType === 'video' ? '🎬' : '📝';
      kb2.push([{ text: `${icon} ${s.name}`, callback_data: `lib_assign_${id}_${phone}` }]);
    });
    kb2.push([{ text: t('back_btn', lang), callback_data: `changesource_${phone}` }]);
    await sendOrUpdate(chatId, t('lib_title', lang), { parse_mode: 'Markdown', reply_markup: { inline_keyboard: kb2 } });
    return;
  }

  if (data === 'add_more_group') {
    await setDB(`users/${chatId}/state`, 'AWAITING_GROUP');
    const kb = { inline_keyboard: [[{ text: t('cancel_btn', lang), callback_data: 'cancel_operation' }]] };
    await sendOrUpdate(chatId, t('send_group', lang), { parse_mode: 'Markdown', reply_markup: kb });
    return;
  }
  if (data === 'finish_groups') {
    await setDB(`users/${chatId}/state`, 'AWAITING_SOURCE');
    const kb = {
      inline_keyboard: [
        [{ text: t('source_saved_btn', lang), callback_data: 'source_saved' }],
        [{ text: t('source_library_btn', lang), callback_data: 'source_library' }],
        [{ text: t('source_custom_btn', lang), callback_data: 'source_custom' }],
        [{ text: t('cancel_btn', lang), callback_data: 'cancel_operation' }]
      ]
    };
    await sendOrUpdate(chatId, t('source_prompt', lang), { reply_markup: kb });
    return;
  }
}

async function sendScanPage(chatId) {
  const session = userSessions[chatId];
  if (!session?.scanGroups) return;
  const lang = await getLang(chatId);
  const perPage = 15;
  const total = Math.ceil(session.scanGroups.length / perPage);
  let page = session.scanPage;
  if (page >= total) page = total - 1;
  if (page < 0) page = 0;
  session.scanPage = page;
  const start = page * perPage;
  const slice = session.scanGroups.slice(start, start + perPage);
  let text = t('select_groups', lang, { count: session.scanSelected.size }) + '\n\n';
  text += `📖 ${t('scan_page', lang, { page: page + 1, total })}`;
  const kb = { inline_keyboard: [] };
  slice.forEach((g, i) => {
    const idx = start + i;
    const sel = session.scanSelected.has(idx);
    const emoji = sel ? '✅' : '⬜';
    const safeTitle = Array.from(g.title || 'Bilinməyən').slice(0, 22).join('');
    kb.inline_keyboard.push([{ text: `${emoji} ${safeTitle}`, callback_data: `scanselect_${idx}` }]);
  });
  const nav = [];
  if (page > 0) nav.push({ text: t('scan_back', lang), callback_data: 'scan_back' });
  if (page < total - 1) nav.push({ text: t('scan_more', lang), callback_data: 'scan_more' });
  if (nav.length) kb.inline_keyboard.push(nav);
  kb.inline_keyboard.push([{ text: t('scan_confirm', lang), callback_data: 'scan_confirm' }]);
  kb.inline_keyboard.push([{ text: t('back_btn', lang), callback_data: 'manage_numbers' }]);
  await sendOrUpdate(chatId, text, { reply_markup: kb });
}

// ============ MESSAGE HANDLER ============
bot.on('message', async (msg) => {
  try {
    if (msg.text && msg.text.startsWith('/')) return;
    if (!msg.text && !msg.photo && !msg.video && !msg.document) return;
    const chatId = msg.chat.id;
    if (!global.botId) { try { global.botId = (await bot.getMe()).id; } catch (e) {} }
    if (msg.from && msg.from.id === global.botId) return;

    const [lang, stateRaw] = await Promise.all([getLang(chatId), getDB(`users/${chatId}/state`)]);
    const state = stateRaw || 'IDLE';
    const text = (msg.text || msg.caption || '').trim();

    // İstifadəçinin daxil etdiyi mətn/kod/şəkil mesajı çatdan silinir -> menyu altında yığılma olmur
    if (/^AWAITING_(LICENSE|PHONE|OTP|GROUP|CUSTOM_SOURCE|INTERVAL|CHANGE_INTERVAL|AUTO_REPLY|LIB_NAME|LIB_CONTENT)$/.test(state)) {
      bot.deleteMessage(chatId, msg.message_id).catch(() => {});
    }

    if (text === t('cancel_btn', lang)) {
      delete userSessions[chatId];
      await setDB(`users/${chatId}/state`, 'IDLE');
      await showMainMenu(chatId);
      return;
    }

    if (state === 'AWAITING_LICENSE') {
      if (!text.startsWith('ELITE-')) { await sendOrUpdate(chatId, t('invalid_lic', lang), { reply_markup: { inline_keyboard: [[{ text: t('back_main', lang), callback_data: 'back_to_main' }]] } }); return; }
      const lic = await getDB(`licenses/${text}`);
      if (!lic) { await sendOrUpdate(chatId, t('not_found_lic', lang), { reply_markup: { inline_keyboard: [[{ text: t('back_main', lang), callback_data: 'back_to_main' }]] } }); return; }
      if (!isLicenseCurrentlyValid(lic)) { await sendOrUpdate(chatId, t('blocked_lic', lang), { reply_markup: { inline_keyboard: [[{ text: t('back_main', lang), callback_data: 'back_to_main' }]] } }); return; }
      if (lic.usedBy && lic.usedBy !== chatId) { await sendOrUpdate(chatId, t('used_lic', lang), { reply_markup: { inline_keyboard: [[{ text: t('back_main', lang), callback_data: 'back_to_main' }]] } }); return; }
      if (!lic.usedBy) await setDB(`licenses/${text}/usedBy`, chatId);
      const hasExpiry = lic.expireTimestamp || lic.expiresAt || lic.expireDate;
      if (!hasExpiry && lic.durationDays) {
        await setDB(`licenses/${text}/expireTimestamp`, Date.now() + (parseInt(lic.durationDays) * 86400000));
      }
      await setDB(`users/${chatId}/activeLicense`, text);
      await saveUserProfile(chatId, msg.from);
      await syncLicenseUserInfo(chatId, text, msg.from);
      delete gl