# How to Run Smart Content Aggregator on Another System 🚀

Follow these simple steps to share this app with your friends!

## 1. Prerequisites
Ensure the system has **Python 3.9+** installed. You can check this by running:
```bash
python3 --version
```

## 2. Prepare the Files
1. **Compress the Project**: Zip the entire `smartcontent_aggregator_UI` folder.
2. **Send it**: Share the ZIP file with your friend.
3. **Extract**: Have them extract the folder to their preferred directory.

## 3. One-Click Setup (Easiest Way)
Your friend just needs to run the setup script for their system:

- **On Mac/Linux**: Open terminal in the folder and run:
  ```bash
  sh setup.sh
  ```
- **On Windows**: Double-click the `setup.bat` file.

These scripts will automatically create a virtual environment, install all dependencies, and start the app!

---

## 4. Manual Setup (Alternative)
If they prefer doing it manually, follow these commands:

## 5. Access the App
Once the server is running, open the browser and go to:
**[http://127.0.0.1:5001](http://127.0.0.1:5001)**

---

## 6. Access Links for your Friend

### Option A: If they are on your Wi-Fi (Same Network)
Give them this exact link:
👉 **[http://192.168.201.106:5001](http://192.168.201.106:5001)**

### Option B: If they are NOT on your Wi-Fi (Public Link)
You need to create a "tunnel" since the app is running on your machine:
1. Open a new Terminal.
2. Type: `ngrok http 5001`
3. Copy the link that starts with `https://...` and send it to them!
