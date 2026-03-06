# Project Chat – Firebase Realtime Database

The project chat in the admin panel uses **Firebase Realtime Database** and **Firebase Storage** only. Firestore is not used for chat.

## Setup

1. **Enable Realtime Database** in Firebase Console: Build → Realtime Database → Create database.
2. **Environment variable** in admin panel `.env.local`:
   ```bash
   NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://YOUR_PROJECT-default-rtdb.europe-west1.firebasedatabase.app
   ```
   (Use the URL shown in the Realtime Database console.)

3. **Storage** is already used elsewhere; ensure Storage is enabled and `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` is set.

## Data structure

```
realtime-db
  chats
    {projectId}
      messages
        {messageId}
          senderId, senderType, text, fileUrl, fileType, createdAt, status, replyTo
      typing
        admin, customer
      lastSeen
        admin, customer
```

- **messages**: one write per message; `status` is `sent` or `read`.
- **typing**: booleans; admin typing is throttled (max once per 2s).
- **lastSeen**: timestamps; updated when the chat panel opens (read receipt).

## Fixing "PERMISSION_DENIED" / "Permission denied"

You must set **Realtime Database rules** in Firebase Console so that **signed-in users** can read and write chat data.

### Steps

1. Open [Firebase Console](https://console.firebase.google.com) → your project (**grunpower-48f15**).
2. Go to **Build** → **Realtime Database**.
3. Open the **Rules** tab.
4. Replace the rules with the following (or **merge** the `chats` block into your existing rules if you already have other root keys):

```json
{
  "rules": {
    "chats": {
      "$projectId": {
        ".read": "auth != null",
        ".write": "auth != null"
      }
    }
  }
}
```

5. Click **Publish**.

A copy of these rules is in **`admin-panel/firebase-realtime-database.rules.json`**.

- **If you already have other rules** (e.g. for other app features), add only the `"chats"` block inside `"rules"` and keep the rest.
- **Storage (images/PDFs):** If you get permission denied when sending images or PDFs, in **Storage** → **Rules** ensure authenticated users can write under your chat path (e.g. `chat/{projectId}/*`). Example for chat uploads:

```
match /chat/{projectId}/{fileName} {
  request.auth != null && request.resource.size < 10 * 1024 * 1024
  allow read, write;
}
```

## Behaviour

- **No Firestore** is used for chat; existing Firestore features (projects, folders, etc.) are unchanged.
- Listeners are attached in `useEffect` with cleanup; no infinite listeners.
- No writes are performed inside realtime listeners.
- Message list is limited to the last 100 messages.
