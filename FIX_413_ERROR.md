# ⚡ Quick Fix: 413 Request Entity Too Large

## Problem
```
413 Request Entity Too Large
nginx/1.26.3 (Ubuntu)
```

Large video uploads are rejected by nginx.

---

## ✅ Solution (2 Steps)

### Step 1: Local App Updated ✅ (Already Done)

Your Node.js app now supports **5GB uploads**:
```javascript
// ✅ Multer: 5GB limit
// ✅ Express JSON: 5GB limit  
// ✅ Express URL-encoded: 5GB limit
```

### Step 2: Update Nginx on AWS ⚠️ (You Need to Do This)

---

## 🚀 AWS Server Setup (3 Commands)

### SSH into your AWS server:
```bash
ssh ubuntu@your-server-ip
```

### 1. Edit nginx config:
```bash
sudo nano /etc/nginx/nginx.conf
```

Add this in the `http {}` block:
```nginx
client_max_body_size 5G;
```

### 2. Or edit your site config:
```bash
sudo nano /etc/nginx/sites-available/default
```

Add this in the `server {}` block:
```nginx
server {
    client_max_body_size 5G;
    client_body_timeout 600s;
    
    location / {
        proxy_pass http://localhost:4000;
        proxy_request_buffering off;
        proxy_buffering off;
        proxy_read_timeout 600s;
    }
}
```

### 3. Reload nginx:
```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## 🎯 That's It!

Your server now accepts **5GB video uploads**!

---

## 📋 Full Configuration

See these files for complete setup:
- **`nginx.conf`** - Complete nginx configuration
- **`AWS_NGINX_SETUP.md`** - Detailed deployment guide

---

## 🧪 Test It

1. Record a video
2. Stop recording  
3. Upload should work! ✅

No more 413 errors! 🚀

