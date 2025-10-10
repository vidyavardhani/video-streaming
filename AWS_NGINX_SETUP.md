# 📦 AWS Nginx Setup for Large Video Uploads

## Problem: 413 Request Entity Too Large

Your nginx server is rejecting large video files. This guide will fix it.

---

## 🎯 Quick Fix

### 1. **Update Your Application** (Done ✅)

The Node.js app now supports **5GB uploads**:
- ✅ Multer: 5GB limit
- ✅ Express JSON: 5GB limit
- ✅ Express URL-encoded: 5GB limit

### 2. **Configure Nginx on AWS**

---

## 🔧 Nginx Configuration Steps

### Step 1: SSH into Your AWS Server

```bash
ssh ubuntu@your-server-ip
# or
ssh ec2-user@your-server-ip
```

### Step 2: Edit Nginx Configuration

```bash
sudo nano /etc/nginx/nginx.conf
```

Add this in the `http` block:

```nginx
http {
    # ...existing config...
    
    # Allow large file uploads
    client_max_body_size 5G;
    client_body_timeout 600s;
    client_header_timeout 600s;
    
    # ...rest of config...
}
```

### Step 3: Edit Your Site Configuration

```bash
sudo nano /etc/nginx/sites-available/default
# or
sudo nano /etc/nginx/sites-available/video-streaming
```

Add this to your `server` block:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    # IMPORTANT: Allow 5GB uploads
    client_max_body_size 5G;
    client_body_timeout 600s;
    client_header_timeout 600s;
    send_timeout 600s;
    
    # Proxy settings
    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        
        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts for large uploads
        proxy_connect_timeout 600s;
        proxy_send_timeout 600s;
        proxy_read_timeout 600s;
        
        # Disable buffering for large files
        proxy_request_buffering off;
        proxy_buffering off;
    }
}
```

### Step 4: Test Nginx Configuration

```bash
sudo nginx -t
```

You should see:
```
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

### Step 5: Reload Nginx

```bash
sudo systemctl reload nginx
# or
sudo service nginx reload
```

---

## 📋 Complete Configuration File

I've created a complete nginx config file: **`nginx.conf`**

### To Use It:

```bash
# On your AWS server
sudo nano /etc/nginx/sites-available/video-streaming

# Copy the contents of nginx.conf into this file

# Enable the site
sudo ln -s /etc/nginx/sites-available/video-streaming /etc/nginx/sites-enabled/

# Remove default if exists
sudo rm /etc/nginx/sites-enabled/default

# Test configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

---

## 🔐 SSL/HTTPS Setup (Recommended)

### Install Certbot (Let's Encrypt)

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal is set up automatically
```

---

## ⚙️ Key Settings Explained

### `client_max_body_size 5G`
- Maximum upload file size
- Set to 5GB to handle large videos

### `client_body_timeout 600s`
- Time to read client request body
- 10 minutes for slow uploads

### `proxy_request_buffering off`
- Disables buffering of client request body
- Allows streaming large files

### `proxy_buffering off`
- Disables buffering of proxied responses
- Better for real-time uploads

---

## 🧪 Testing

### Test 1: Check Nginx Status

```bash
sudo systemctl status nginx
```

### Test 2: Check Configuration

```bash
sudo nginx -t
```

### Test 3: Upload Test File

```bash
# From your local machine
curl -X POST http://your-server-ip/test \
  -F "file=@large-video.mp4" \
  -v
```

### Test 4: Check Nginx Logs

```bash
# Error log
sudo tail -f /var/log/nginx/error.log

# Access log
sudo tail -f /var/log/nginx/access.log
```

---

## 🐛 Troubleshooting

### Still Getting 413 Error?

#### Check 1: Nginx Global Config
```bash
sudo grep -r "client_max_body_size" /etc/nginx/
```

#### Check 2: PHP-FPM (if using)
```bash
sudo nano /etc/php/7.4/fpm/php.ini
# Set: upload_max_filesize = 5G
# Set: post_max_size = 5G
sudo systemctl restart php7.4-fpm
```

#### Check 3: Multiple Server Blocks
Make sure ALL server blocks have `client_max_body_size 5G`

#### Check 4: Reload vs Restart
```bash
# Try restart instead of reload
sudo systemctl restart nginx
```

---

## 📊 AWS EC2 Instance Requirements

### Minimum Specs for 5GB Uploads:
- **RAM**: 4GB minimum (8GB recommended)
- **Storage**: EBS volume with enough space
- **Network**: Ensure security groups allow HTTP/HTTPS

### Security Group Settings:
```
Inbound Rules:
- Type: HTTP, Port: 80, Source: 0.0.0.0/0
- Type: HTTPS, Port: 443, Source: 0.0.0.0/0
- Type: Custom TCP, Port: 4000, Source: Your IP (for direct access)
```

---

## 🚀 Production Checklist

- [ ] Set `client_max_body_size 5G` in nginx
- [ ] Set timeouts to 600s (10 minutes)
- [ ] Disable proxy buffering
- [ ] Enable SSL/HTTPS with Certbot
- [ ] Configure security groups on AWS
- [ ] Set up log rotation
- [ ] Enable gzip compression (for other files)
- [ ] Set up monitoring (CloudWatch)
- [ ] Configure auto-scaling (if needed)

---

## 📝 Common Nginx Locations

### Ubuntu/Debian:
- Main config: `/etc/nginx/nginx.conf`
- Sites: `/etc/nginx/sites-available/`
- Enabled: `/etc/nginx/sites-enabled/`
- Logs: `/var/log/nginx/`

### Amazon Linux/CentOS:
- Main config: `/etc/nginx/nginx.conf`
- Conf.d: `/etc/nginx/conf.d/`
- Logs: `/var/log/nginx/`

---

## 🔄 Quick Commands Reference

```bash
# Check nginx version
nginx -v

# Test configuration
sudo nginx -t

# Reload configuration
sudo systemctl reload nginx

# Restart nginx
sudo systemctl restart nginx

# Check status
sudo systemctl status nginx

# View error logs
sudo tail -f /var/log/nginx/error.log

# View access logs
sudo tail -f /var/log/nginx/access.log

# Enable nginx on boot
sudo systemctl enable nginx
```

---

## 🎯 Summary

### What We Fixed:
1. ✅ Increased Node.js app limits to 5GB
2. ✅ Provided nginx configuration for 5GB uploads
3. ✅ Added timeout settings for slow uploads
4. ✅ Disabled buffering for large files
5. ✅ Added WebSocket support for Socket.IO

### Files Created:
- ✅ `nginx.conf` - Complete nginx configuration
- ✅ `AWS_NGINX_SETUP.md` - This deployment guide

### To Deploy:
1. Update nginx config on AWS server
2. Set `client_max_body_size 5G`
3. Set timeouts to 600s
4. Reload nginx
5. Test with large file

---

## 📞 Need Help?

### If uploads still fail:

1. **Check nginx error log**:
   ```bash
   sudo tail -50 /var/log/nginx/error.log
   ```

2. **Check application log**:
   ```bash
   pm2 logs
   # or
   tail -f server.log
   ```

3. **Check disk space**:
   ```bash
   df -h
   ```

4. **Check memory**:
   ```bash
   free -h
   ```

---

## 🎉 Done!

Your server now supports **5GB video uploads**!

Test it:
1. Record a long video (or use a large test file)
2. Stop recording
3. Watch it upload successfully!

**No more 413 errors!** 🚀

