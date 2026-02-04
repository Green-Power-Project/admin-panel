# Green Power Admin Panel

A comprehensive admin panel for managing customers, projects, files, and workflows for the Green Power customer portal.

## Features

- 🔐 **Admin Authentication** - Secure admin-only access
- 📁 **Project Management** - Create, edit, delete, and assign projects to customers
- 👥 **Customer Management** - Create customer accounts and view customer details
- 📤 **File Management** - Upload files to any project folder, view, and delete files
- 📊 **File Read Tracking** - Monitor which files customers have viewed
- ✅ **Report Approvals** - Track which reports customers have approved
- 📈 **Dashboard** - Overview statistics and quick actions

## Tech Stack

- **Next.js 14** - React framework with App Router
- **TypeScript** - Type-safe development
- **Firebase Authentication** - Admin authentication
- **Firebase Firestore** - Database for projects, customers, tracking
- **Firebase Storage** - File storage
- **Tailwind CSS** - Styling

## Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn
- Firebase project (same as window-app)
- Admin account setup in Firebase

### Installation

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Firebase**
   Create a `.env.local` file in the root directory:
   ```env
   NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
   ```

3. **Set Up Admin Access**
   
   Create an `admins` collection in Firestore with admin user IDs:
   
   - Go to Firebase Console → Firestore Database
   - Create a collection named `admins`
   - Add documents with document ID = admin user's Firebase Auth UID
   - The document can be empty or contain metadata like:
     ```json
     {
       "email": "admin@greenpower.com",
       "createdAt": "2024-01-01T00:00:00Z"
     }
     ```

4. **Create Admin Account**
   
   - Create an admin user in Firebase Authentication (Email/Password)
   - Add the user's UID to the `admins` collection in Firestore
   - Log in with the admin credentials

5. **Run Development Server**
   ```bash
   npm run dev
   ```

6. **Open Browser**
   Navigate to http://localhost:3000

## Project Structure

```
admin-panel/
├── app/                    # Next.js app directory
│   ├── dashboard/          # Admin dashboard
│   ├── projects/           # Project management
│   ├── customers/          # Customer management
│   ├── files/              # File management
│   ├── tracking/           # File read tracking
│   ├── approvals/          # Report approvals
│   └── login/              # Admin login
├── components/             # React components
├── contexts/               # React contexts (Auth)
├── lib/                    # Utilities (Firebase config, folder structure)
└── functions/              # Cloud Functions (email automation)
```

## Features Overview

### Dashboard
- Overview statistics (projects, customers, files, approvals)
- Quick actions for common tasks
- Recent activity feed

### Project Management
- **List Projects** - View all projects with customer assignments
- **Create Project** - Add new projects and assign to customers
- **Edit Project** - Update project details and customer assignment
- **Delete Project** - Remove projects and associated files
- **Project Details** - View project folders and navigate to file management

### Customer Management
- **List Customers** - View all customers with project counts
- **Create Customer** - Create new customer accounts
- **Customer Details** - View customer information and assigned projects

### File Management
- **Select Project** - Choose a project to manage files
- **Select Folder** - Navigate through project folder structure
- **Upload Files** - Upload PDF, JPG, PNG files (up to 50 MB for admin)
- **View Files** - Browse files in each folder
- **Download Files** - Download any file
- **Delete Files** - Remove files from storage

### File Read Tracking
- Monitor which files customers have viewed
- Filter by project
- View read timestamps
- Track customer engagement

### Report Approvals
- Monitor which reports customers have approved
- Filter by project and status
- View approval timestamps
- Track workflow progress

## Security

- **Admin-Only Access** - Only users in the `admins` Firestore collection can access the panel
- **Protected Routes** - All admin pages require authentication
- **Firebase Security Rules** - Ensure proper Firestore and Storage rules are configured

## Cloud Functions

Cloud Functions for email automation are set up in the `functions/` directory. See the functions README for setup instructions.

## Building for Production

```bash
npm run build
npm start
```

## Notes

- This admin panel uses the same Firebase project as the window-app
- Admin accounts must be created manually and added to the `admins` collection
- Customer emails require Firebase Admin SDK to fetch (currently shows placeholder)
- File upload size limit is 20 MB for admins and customers (client-side validation in files, gallery, and customer portal)

