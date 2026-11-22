const crypto = require('crypto');

class LetsPay {
  constructor(apiKey) {
    this.LetsPayBaseUrl = 'https://demo.kitsuhost.me/api/v1';
    this.LetsPayApiKey = apiKey;
    this.LetsPayDefaultHeaders = {
      'Authorization': `Bearer ${this.LetsPayApiKey}`,
      'Content-Type': 'application/json'
    };
  }

  // 1. Membuat Pembayaran
  async createPayment(paymentData, idempotencyKey) {
    try {
      const headers = { ...this.LetsPayDefaultHeaders };
      if (idempotencyKey) {
        headers['Idempotency-Key'] = idempotencyKey;
      }

      const response = await fetch(`${this.LetsPayBaseUrl}/payments`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(paymentData)
      });
      return await response.json();
    } catch (error) {
      console.error('Error creating payment:', error);
      throw error;
    }
  }

  // 2. Mendapatkan Daftar Pembayaran (BARU)
  async getPayments(params = {}) {
    try {
      const queryString = new URLSearchParams(params).toString();
      const url = queryString ? `${this.LetsPayBaseUrl}/payments?${queryString}` : `${this.LetsPayBaseUrl}/payments`;

      const response = await fetch(url, {
        method: 'GET',
        headers: this.LetsPayDefaultHeaders
      });
      return await response.json();
    } catch (error) {
      console.error('Error fetching payments:', error);
      throw error;
    }
  }

  // 3. Mendapatkan Detail Pembayaran
  async getPaymentDetail(paymentId) {
    try {
      const response = await fetch(`${this.LetsPayBaseUrl}/payments/${paymentId}`, {
        method: 'GET',
        headers: this.LetsPayDefaultHeaders
      });
      return await response.json();
    } catch (error) {
      console.error('Error getting payment detail:', error);
      throw error;
    }
  }

  // 4. Membatalkan Pembayaran
  async cancelPayment(paymentId) {
    try {
      const response = await fetch(`${this.LetsPayBaseUrl}/payments/${paymentId}/cancel`, {
        method: 'POST',
        headers: this.LetsPayDefaultHeaders
      });
      return await response.json();
    } catch (error) {
      console.error('Error canceling payment:', error);
      throw error;
    }
  }

  // 5. Cek Saldo & Ringkasan Settlement
  async checkBalance() {
    try {
      const response = await fetch(`${this.LetsPayBaseUrl}/balance`, {
        method: 'GET',
        headers: this.LetsPayDefaultHeaders
      });
      return await response.json();
    } catch (error) {
      console.error('Error checking balance:', error);
      throw error;
    }
  }

  // 6. Validasi Signature Webhook (BARU)
  verifyWebhookSignature(signatureHeader, rawBody, webhookSecret) {
    if (!signatureHeader || !rawBody || !webhookSecret) {
      return false;
    }

    try {
      const match = signatureHeader.match(/t=(\d+),v1=([a-f0-9]+)/);
      if (!match) return false;

      const [, ts, sig] = match;

      // Tolak jika timestamp lebih dari 5 menit (300 detik)
      if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) {
        return false;
      }

      const expected = crypto
        .createHmac("sha256", webhookSecret)
        .update(`${ts}.${rawBody}`)
        .digest("hex");

      const a = Buffer.from(expected, "utf8");
      const b = Buffer.from(sig, "utf8");

      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    } catch (error) {
      console.error('Error verifying webhook signature:', error);
      return false;
    }
  }
}

module.exports = LetsPay;
