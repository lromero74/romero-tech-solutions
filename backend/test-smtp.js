#!/usr/bin/env node
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

console.log('🔍 Testing SES SMTP credentials...');

// Use SES SMTP credentials if available, otherwise fall back to AWS credentials
const smtpUser = process.env.SES_SMTP_USER || process.env.AWS_ACCESS_KEY_ID;
const smtpPass = process.env.SES_SMTP_PASS || process.env.AWS_SECRET_ACCESS_KEY;

console.log('📧 SMTP Configuration:', {
  host: `email-smtp.${process.env.AWS_REGION}.amazonaws.com`,
  port: 587,
  user: smtpUser ? `${smtpUser.slice(0, 4)}...${smtpUser.slice(-4)}` : 'NOT SET',
  pass: smtpPass ? '***SET***' : 'NOT SET',
  region: process.env.AWS_REGION,
  fromEmail: process.env.SES_FROM_EMAIL
});

if (!smtpUser || !smtpPass) {
  console.error('❌ No SMTP credentials found!');
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host: `email-smtp.${process.env.AWS_REGION}.amazonaws.com`,
  port: 587,
  secure: false,
  auth: {
    user: smtpUser,
    pass: smtpPass,
  },
});

console.log('🔄 Verifying SMTP connection...');

try {
  await transporter.verify();
  console.log('✅ SMTP credentials are valid and connection successful!');
} catch (error) {
  console.error('❌ SMTP verification failed:', error.message);
  if (error.responseCode) {
    console.error('📧 Response code:', error.responseCode);
  }
  if (error.response) {
    console.error('📧 Server response:', error.response);
  }
  process.exit(1);
}

console.log('🎉 SES SMTP test completed successfully!');