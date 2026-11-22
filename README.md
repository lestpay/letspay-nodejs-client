# LetsPay Client - Node.js

Client library resmi untuk mengintegrasikan **LetsPay QRIS Payment API** ke dalam aplikasi Node.js Anda. Mendukung pembuatan QRIS dinamis, pengecekan status, pembatalan, pengecekan saldo, dan panduan validasi webhook.

## 1. Instalasi

### Menggunakan NPM
```bash
npm install --save letspay-nodejs-client
```

### Instalasi Manual
Jika tidak menggunakan NPM, Anda dapat mengunduh repositori ini dan memanggil file `index.js`.
```javascript
const LetsPay = require('./path/to/letspay-nodejs-client/index.js');
```

## 2. Inisialisasi

Dapatkan API Key dari dashboard LetsPay Anda (berawalan `lsp_`). 
```javascript
const LetsPay = require('letspay-nodejs-client');

// Inisialisasi dengan API Key Anda
const client = new LetsPay('lsp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx');
```

## 3. Penggunaan (Usage)

### 3.1. Membuat Pembayaran QRIS
Membuat QRIS dinamis. Nominal minimal Rp 1 dan maksimal Rp 10.000.000. Anda dapat menambahkan `Idempotency-Key` untuk mencegah duplikasi transaksi jika terjadi *retry*.

```javascript
async function createOrder() {
  const paymentData = {
    amount: 25000, // Wajib (Rupiah, Integer)
    customer_name: "Budi Santoso", // Wajib (2-100 karakter)
    external_id: "INV-2026-0128", // Referensi unik merchant
    description: "Pesanan #128", // Opsional
    customer_email: "budi@email.com", // Opsional
    customer_phone: "08123456789" // Opsional
  };

  const idempotencyKey = "order-2026-0128"; // Opsional (8-100 karakter)

  try {
    const response = await client.createPayment(paymentData, idempotencyKey);
    console.log("QR String:", response.data.qr_string);
    console.log("Checkout URL:", response.data.checkout_url);
  } catch (error) {
    console.error("Gagal membuat pembayaran:", error);
  }
}

createOrder();
```

### 3.2. Cek Detail / Status Pembayaran
Mengambil detail pembayaran berdasarkan ID Transaksi LetsPay (`LSP-...`).

```javascript
async function checkStatus() {
  const paymentId = 'LSP-20261116-9EEE89F7';
  
  try {
    const response = await client.checkPaymentStatus(paymentId);
    console.log("Status Pembayaran:", response.data.status); // pending, paid, expired, failed, refunded
  } catch (error) {
    console.error("Gagal cek status:", error);
  }
}
```

### 3.3. Membatalkan Pembayaran
Membatalkan transaksi yang masih berstatus `pending`. Transaksi yang sudah lunas (`paid`) tidak dapat dibatalkan melalui fungsi ini.

```javascript
async function cancelOrder() {
  const paymentId = 'LSP-20261116-9EEE89F7';
  
  try {
    const response = await client.cancelPayment(paymentId);
    console.log("Pembayaran dibatalkan:", response);
  } catch (error) {
    console.error("Gagal membatalkan pembayaran:", error);
  }
}
```

### 3.4. Cek Saldo Merchant
Melihat saldo (`available`, `pending_settlement`) dan ringkasan settlement merchant Anda. (Membutuhkan scope `balance:read`).

```javascript
async function getBalance() {
  try {
    const response = await client.checkBalance();
    console.log("Saldo Tersedia:", response.data.available);
    console.log("Total Volume:", response.data.gross_volume);
  } catch (error) {
    console.error("Gagal mengambil saldo:", error);
  }
}
```

## 4. Validasi Webhook

LetsPay akan mengirimkan HTTP POST JSON saat status pembayaran berubah (`paid`, `expired`, `failed`, `refunded`). 

**PENTING**: Anda harus memvalidasi *signature* dari webhook untuk memastikan data berasal dari LetsPay. Gunakan `rawBody` persis seperti yang dikirim (jangan di-*parse* lalu di-*stringify* ulang).

Berikut adalah contoh implementasi handler webhook di Express.js:

```javascript
const crypto = require("node:crypto");
const express = require('express');
const app = express();

// Konfigurasi agar Express menyimpan rawBody
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString('utf8');
  }
}));

app.post('/webhooks/letspay', (req, res) => {
  const raw = req.rawBody;
  const header = req.headers["x-letspay-signature"];
  
  if (!header) return res.status(401).send('Missing Signature');

  const [, ts, sig] = header.match(/t=(\d+),v1=([a-f0-9]+)/) || [];
  
  if (!ts || !sig) return res.status(401).send('Invalid Signature Format');

  const expected = crypto
    .createHmac("sha256", process.env.LETSPAY_WEBHOOK_SECRET)
    .update(`${ts}.${raw}`)
    .digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(sig, "utf8");
  
  // Validasi kecocokan signature
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).end();
  }
  
  // Tolak jika timestamp lebih dari 5 menit (300 detik) untuk mencegah replay attack
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) {
    return res.status(401).end();
  }

  // Signature Valid. Proses webhook secara idempoten
  const payload = req.body;
  console.log(`Event: ${payload.event}, Status: ${payload.data.status}`);
  
  // Balas dengan HTTP 2xx dalam waktu maksimal 8 detik
  res.status(200).send('Webhook Received');
});
```

## 5. Referensi Status & Error

### Status Pembayaran
| Status | Keterangan |
| --- | --- |
| `pending` | Menunggu pembayaran; QR masih berlaku. |
| `paid` | Dana diterima (settlement/capture). Status final, hanya bisa menjadi refunded. |
| `expired` | QR kedaluwarsa sebelum dibayar. |
| `failed` | Dibatalkan, ditolak, atau gagal. |
| `refunded` | Dana dikembalikan (final). |

### HTTP Error Codes
| Code | Alasan / Kapan Terjadi |
| --- | --- |
| `401` | **missing_key / invalid_key**: API Key tidak ada, salah, atau dicabut. |
| `403` | **insufficient_scope**: Scope API Key tidak mencukupi untuk tindakan tersebut. |
| `404` | **not_found**: Order tidak ditemukan atau bukan milik API Key tersebut. |
| `409` | **external_id_conflict / idempotency**: `external_id` sudah dipakai, atau konflik Idempotency. |
| `422` | **validation_error**: Input parameter tidak valid (contoh: nominal di luar batas). |
| `429` | **rate_limited**: Melewati limit API (Cek header `Retry-After`). |
| `502` | **payment_failed / provider_error**: Gagal di sisi provider/gateway upstream. |
