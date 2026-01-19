# Cloud Functions for Green Power Admin Panel

This directory contains Firebase Cloud Functions for email automation and notifications.

## Functions

### 1. `notifyNewFile`
Triggers automatically when admin uploads a file to Firebase Storage in a project folder. Sends an email notification to the customer.

**Trigger:** Storage object finalization (fires once per file upload)
**Path:** `projects/{projectId}/{folderPath}/{filename}`

**Email Includes:**
- Project name
- Folder name
- Exact file name (e.g., Report_20.10.2025.pdf)

**Behavior:**
- Only sends for actual files (skips `.keep` placeholder files)
- Skips files in `01_Customer_Uploads` folder
- Gets customer email from `customers` collection or Firebase Auth
- Sends email only once per file upload (triggered on file creation)

### 2. `notifyReportApproval`
Triggers when a customer approves a report. Sends an email notification to admin.

**Trigger:** Firestore document creation in `reportApprovals` collection

### 3. `sendWelcomeEmail`
Triggers when a new user account is created. Sends a welcome email to customers.

**Trigger:** Firebase Auth user creation

## Setup

1. **Install Dependencies**
   ```bash
   cd functions
   npm install
   ```

2. **Configure Email**
   
   You can configure email using Firebase Functions config or environment variables:
   
   **Option 1: Firebase Functions Config**
   ```bash
   firebase functions:config:set email.user="your-email@gmail.com"
   firebase functions:config:set email.password="your-app-password"
   firebase functions:config:set email.admin="admin@greenpower.com"
   firebase functions:config:set app.portal_url="https://your-portal-url.com"
   ```
   
   **Option 2: Environment Variables**
   Create a `.env` file in the functions directory:
   ```env
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASSWORD=your-app-password
   ADMIN_EMAIL=admin@greenpower.com
   ```

3. **Deploy Functions**
   ```bash
   firebase deploy --only functions
   ```

## Email Configuration

### Gmail Setup
1. Enable 2-Factor Authentication on your Gmail account
2. Generate an App Password:
   - Go to Google Account → Security → 2-Step Verification → App passwords
   - Create an app password for "Mail"
   - Use this password in the configuration

### Other Email Providers
Modify the transporter configuration in `index.js` to use your email provider's SMTP settings.

## Testing Locally

```bash
firebase emulators:start --only functions
```

## Notes

- Functions require Firebase Admin SDK access
- Make sure your Firebase project has billing enabled (required for Cloud Functions)
- Email sending requires proper SMTP configuration
- Functions run in Node.js 18 environment

