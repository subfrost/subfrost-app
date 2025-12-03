/**
 * Universal Bitcoin Keystore - Google Apps Script
 * 
 * This script handles Bitcoin wallet keystore backup and recovery via Google Drive.
 * It stores encrypted keystores in a dedicated folder in the user's Google Drive.
 * Works with any Bitcoin wallet that uses standard encrypted keystores.
 * 
 * Storage Method: Google Drive (more reliable than email for larger keystores)
 * Also sends notification email when backup is created.
 * 
 * Security: Only encrypted keystores are stored. Password required to decrypt.
 */

// Configuration
const ROOT_FOLDER_NAME = '__BITCOINUNIVERSAL';
const EMAIL_SUBJECT = 'Bitcoin Wallet Keystore Backup';

/**
 * Get or create the root backup folder in Google Drive
 */
function getRootFolder() {
  const folders = DriveApp.getFoldersByName(ROOT_FOLDER_NAME);
  
  if (folders.hasNext()) {
    return folders.next();
  } else {
    // Create the folder at root level
    const folder = DriveApp.createFolder(ROOT_FOLDER_NAME);
    folder.setDescription('Universal Bitcoin Keystore - Encrypted wallet backups');
    return folder;
  }
}

/**
 * Create a wallet-specific subfolder with timestamp
 */
function createWalletFolder(timestamp) {
  const rootFolder = getRootFolder();
  const folderName = timestamp.replace(/[:.]/g, '-'); // Make filename-safe
  const walletFolder = rootFolder.createFolder(folderName);
  walletFolder.setDescription(`Bitcoin wallet backup created ${new Date(timestamp).toLocaleString()}`);
  return walletFolder;
}

/**
 * Get a specific wallet folder by timestamp
 */
function getWalletFolder(timestamp) {
  const rootFolder = getRootFolder();
  const folderName = timestamp.replace(/[:.]/g, '-');
  const folders = rootFolder.getFoldersByName(folderName);
  
  if (folders.hasNext()) {
    return folders.next();
  }
  return null;
}

/**
 * Save wallet backup to Google Drive and send notification email
 * POST /exec with { action: 'backup', email, encryptedKeystore, passwordHint (optional), walletLabel (optional) }
 */
function sendWalletBackup(email, encryptedKeystore, passwordHint, walletLabel) {
  try {
    const timestamp = new Date().toISOString();
    const timestampFormatted = new Date(timestamp).toLocaleString();
    
    // Create wallet-specific folder: /__BITCOINUNIVERSAL/2025-11-28T14-30-22-123Z/
    const walletFolder = createWalletFolder(timestamp);
    
    // Save keystore.json
    const keystoreData = {
      version: '1.0',
      timestamp: timestamp,
      encryptedKeystore: encryptedKeystore,
      email: email,
      backupMethod: 'google-drive',
      walletLabel: walletLabel || 'My Bitcoin Wallet',
    };
    
    const keystoreFile = walletFolder.createFile(
      'keystore.json',
      JSON.stringify(keystoreData, null, 2),
      MimeType.PLAIN_TEXT
    );
    keystoreFile.setDescription(`Bitcoin wallet keystore created on ${timestampFormatted}`);
    
    // Save password_hint.txt if provided
    let hintFileId = null;
    if (passwordHint && passwordHint.trim()) {
      const hintFile = walletFolder.createFile(
        'password_hint.txt',
        passwordHint.trim(),
        MimeType.PLAIN_TEXT
      );
      hintFile.setDescription('Password hint for wallet keystore');
      hintFileId = hintFile.getId();
    }
    
    const folderUrl = walletFolder.getUrl();
    const folderId = walletFolder.getId();
    const keystoreFileId = keystoreFile.getId();
    
    // Send notification email
    const subject = EMAIL_SUBJECT;
    
    const htmlBody = `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .keystore-box { background: white; padding: 15px; border-radius: 5px; border-left: 4px solid #667eea; margin: 20px 0; overflow-wrap: break-word; word-wrap: break-word; font-family: monospace; font-size: 12px; }
            .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
            .btn { display: inline-block; padding: 12px 24px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 10px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔐 Bitcoin Wallet Keystore Backup</h1>
              <p>Secure backup created on ${new Date(timestamp).toLocaleString()}</p>
            </div>
            <div class="content">
              <h2>Backup Created Successfully</h2>
              <p>Your encrypted Bitcoin wallet keystore has been safely backed up to Google Drive. To restore your wallet, you will need:</p>
              <ul>
                <li>✅ Access to this Google Drive account</li>
                <li>✅ Your wallet password (to decrypt)</li>
              </ul>
              
              <div class="warning">
                <strong>⚠️ Important Security Notice</strong>
                <p>This keystore is encrypted, but you should still keep this email secure:</p>
                <ul>
                  <li>Keep your password safe and never share it</li>
                  <li>Enable 2-factor authentication on your Gmail account</li>
                  <li>Delete this email after successfully restoring your wallet</li>
                </ul>
              </div>

              <h3>Backup Location</h3>
              <div class="keystore-box">
                <strong>Folder:</strong> ${ROOT_FOLDER_NAME}/${walletFolder.getName()}<br>
                <strong>Files:</strong> keystore.json${passwordHint ? ', password_hint.txt' : ''}<br>
                <strong>Created:</strong> ${timestampFormatted}<br>
                ${walletLabel ? `<strong>Label:</strong> ${walletLabel}` : ''}
              </div>
              
              <a href="${folderUrl}" class="btn">View in Google Drive</a>

              <h3>How to Restore</h3>
              <ol>
                <li>Go to your Bitcoin wallet application</li>
                <li>Select "Restore from Gmail" or "Import Keystore"</li>
                <li>Authenticate with Gmail (this email account)</li>
                <li>Enter your wallet password to decrypt</li>
              </ol>

              <div class="footer">
                <p>This is an automated email from Universal Bitcoin Keystore</p>
                <p>Backup timestamp: ${timestamp}</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    const plainBody = `
Bitcoin Wallet Keystore Backup
Created: ${timestampFormatted}

BACKUP LOCATION:
Your encrypted keystore has been saved to Google Drive:
Folder: ${ROOT_FOLDER_NAME}/${walletFolder.getName()}
Files: keystore.json${passwordHint ? ', password_hint.txt' : ''}
${walletLabel ? `Label: ${walletLabel}` : ''}

View in Drive: ${folderUrl}

IMPORTANT SECURITY NOTICE:
- This keystore is encrypted with your password
- Keep your password safe and never share it
- Enable 2-factor authentication on your Google account
- The backup is stored securely in your Google Drive

HOW TO RESTORE:
1. Go to your Bitcoin wallet application
2. Select "Restore from Google Drive" or "Import Keystore"
3. Authenticate with Google (this account)
4. Select your wallet from the list of backups
5. View password hint if you saved one
6. Enter your password to decrypt

Backup timestamp: ${timestamp}
Folder ID: ${folderId}
    `;

    // Send notification email
    GmailApp.sendEmail(email, subject, plainBody, {
      htmlBody: htmlBody,
      name: 'Universal Bitcoin Keystore',
    });

    return {
      success: true,
      message: 'Backup created successfully in Google Drive',
      timestamp: timestamp,
      folderId: folderId,
      folderName: walletFolder.getName(),
      folderUrl: folderUrl,
      keystoreFileId: keystoreFileId,
      hintFileId: hintFileId,
      walletLabel: walletLabel || 'My Bitcoin Wallet',
      hasPasswordHint: !!passwordHint,
    };
  } catch (error) {
    Logger.log('Error sending backup: ' + error);
    throw new Error('Failed to send backup email: ' + error.toString());
  }
}

/**
 * Retrieve wallet backup from Google Drive by folder ID
 * POST /exec with { action: 'restore', email, folderId }
 */
function retrieveWalletBackup(email, folderId) {
  try {
    if (!folderId) {
      return {
        success: false,
        message: 'Folder ID is required. Use list action to get available wallets.',
      };
    }
    
    // Get the wallet folder
    const walletFolder = DriveApp.getFolderById(folderId);
    
    // Verify it's under __BITCOINUNIVERSAL
    const rootFolder = getRootFolder();
    const parents = walletFolder.getParents();
    let isUnderRoot = false;
    while (parents.hasNext()) {
      if (parents.next().getId() === rootFolder.getId()) {
        isUnderRoot = true;
        break;
      }
    }
    
    if (!isUnderRoot) {
      return {
        success: false,
        message: 'Invalid wallet folder',
      };
    }
    
    // Read keystore.json
    const keystoreFiles = walletFolder.getFilesByName('keystore.json');
    if (!keystoreFiles.hasNext()) {
      return {
        success: false,
        message: 'Keystore file not found in wallet folder',
      };
    }
    
    const keystoreFile = keystoreFiles.next();
    const keystoreContent = keystoreFile.getBlob().getDataAsString();
    const keystoreData = JSON.parse(keystoreContent);
    
    // Try to read password_hint.txt if it exists
    let passwordHint = null;
    const hintFiles = walletFolder.getFilesByName('password_hint.txt');
    if (hintFiles.hasNext()) {
      const hintFile = hintFiles.next();
      passwordHint = hintFile.getBlob().getDataAsString();
    }
    
    return {
      success: true,
      message: 'Wallet retrieved successfully from Google Drive',
      encryptedKeystore: keystoreData.encryptedKeystore,
      backupDate: keystoreData.timestamp,
      walletLabel: keystoreData.walletLabel || 'My Bitcoin Wallet',
      passwordHint: passwordHint,
      folderId: folderId,
      folderName: walletFolder.getName(),
    };
  } catch (error) {
    Logger.log('Error retrieving backup: ' + error);
    return {
      success: false,
      message: 'Failed to retrieve backup: ' + error.toString(),
    };
  }
}

/**
 * List all available wallet backups in Google Drive
 * POST /exec with { action: 'list', email }
 */
function listWalletBackups(email) {
  try {
    const rootFolder = getRootFolder();
    const walletFolders = rootFolder.getFolders();
    const wallets = [];

    while (walletFolders.hasNext()) {
      const folder = walletFolders.next();
      
      // Try to read keystore.json to get metadata
      let walletLabel = folder.getName();
      let timestamp = null;
      let hasPasswordHint = false;
      
      try {
        const keystoreFiles = folder.getFilesByName('keystore.json');
        if (keystoreFiles.hasNext()) {
          const keystoreFile = keystoreFiles.next();
          const keystoreContent = keystoreFile.getBlob().getDataAsString();
          const keystoreData = JSON.parse(keystoreContent);
          
          walletLabel = keystoreData.walletLabel || folder.getName();
          timestamp = keystoreData.timestamp;
          
          // Check if password hint exists
          const hintFiles = folder.getFilesByName('password_hint.txt');
          hasPasswordHint = hintFiles.hasNext();
          
          wallets.push({
            folderId: folder.getId(),
            folderName: folder.getName(),
            walletLabel: walletLabel,
            timestamp: timestamp,
            createdDate: folder.getDateCreated().toISOString(),
            hasPasswordHint: hasPasswordHint,
            folderUrl: folder.getUrl(),
          });
        }
      } catch (e) {
        // Skip folders that don't have valid keystore.json
        Logger.log('Skipping invalid wallet folder: ' + folder.getName());
      }
    }
    
    // Sort by timestamp/date (newest first)
    wallets.sort((a, b) => {
      const dateA = new Date(a.timestamp || a.createdDate);
      const dateB = new Date(b.timestamp || b.createdDate);
      return dateB.getTime() - dateA.getTime();
    });

    return {
      success: true,
      wallets: wallets,
      count: wallets.length,
      rootFolderUrl: rootFolder.getUrl(),
    };
  } catch (error) {
    Logger.log('Error listing backups: ' + error);
    throw new Error('Failed to list backups: ' + error.toString());
  }
}

/**
 * Main entry point for web app
 * Handles POST requests from the Next.js app
 * Uses OAuth to access user's Drive (not the script owner's Drive)
 */
function doPost(e) {
  try {
    const params = JSON.parse(e.postData.contents);
    const action = params.action;
    const accessToken = params.accessToken;

    // Validate access token
    if (!accessToken) {
      throw new Error('Access token required');
    }

    // Set the OAuth token for this request
    // This makes Drive API calls use the user's Drive, not the script owner's
    DriveApp.getRootFolder(); // Initialize DriveApp
    
    let result;
    
    switch (action) {
      case 'backup':
        if (!params.encryptedKeystore) {
          throw new Error('Missing encrypted keystore');
        }
        result = sendWalletBackup(
          params.encryptedKeystore,
          params.passwordHint || null,
          params.walletLabel || null
        );
        break;
        
      case 'restore':
        if (!params.folderId) {
          throw new Error('Missing folderId for restore action');
        }
        result = retrieveWalletBackup(params.folderId);
        break;
        
      case 'list':
        result = listWalletBackups();
        break;
        
      case 'delete':
        if (!params.folderId) {
          throw new Error('Missing folderId for delete action');
        }
        result = deleteWalletBackup(params.folderId);
        break;
        
      default:
        throw new Error('Invalid action: ' + action);
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    Logger.log('Error in doPost: ' + error);
    
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString(),
    }))
    .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Delete a specific wallet backup folder
 * POST /exec with { action: 'delete', email, folderId }
 */
function deleteWalletBackup(email, folderId) {
  try {
    if (!folderId) {
      throw new Error('Folder ID is required');
    }
    
    const folder = DriveApp.getFolderById(folderId);
    const rootFolder = getRootFolder();
    
    // Verify folder is under __BITCOINUNIVERSAL
    const parents = folder.getParents();
    let isUnderRoot = false;
    while (parents.hasNext()) {
      if (parents.next().getId() === rootFolder.getId()) {
        isUnderRoot = true;
        break;
      }
    }
    
    if (!isUnderRoot) {
      throw new Error('Folder not in backup directory');
    }
    
    // Move entire wallet folder to trash
    folder.setTrashed(true);
    
    return {
      success: true,
      message: 'Wallet backup deleted successfully',
      folderId: folderId,
    };
  } catch (error) {
    Logger.log('Error deleting backup: ' + error);
    throw new Error('Failed to delete backup: ' + error.toString());
  }
}

/**
 * Test function - run this in Apps Script editor to test
 */
function testBackup() {
  const testEmail = Session.getActiveUser().getEmail();
  const testKeystore = '{"version":1,"crypto":{"cipher":"aes-256-gcm","ciphertext":"test"}}';
  const testHint = 'My cat\'s name + birth year';
  const testLabel = 'Test Wallet';
  
  const result = sendWalletBackup(testEmail, testKeystore, testHint, testLabel);
  Logger.log('Test result: ' + JSON.stringify(result));
}

/**
 * Test list function
 */
function testList() {
  const testEmail = Session.getActiveUser().getEmail();
  const result = listWalletBackups(testEmail);
  Logger.log('Wallets: ' + JSON.stringify(result));
}

/**
 * Test retrieve function - use a folderId from testList()
 */
function testRetrieve() {
  const testEmail = Session.getActiveUser().getEmail();
  
  // First get list to find a folderId
  const list = listWalletBackups(testEmail);
  if (list.wallets && list.wallets.length > 0) {
    const folderId = list.wallets[0].folderId;
    const result = retrieveWalletBackup(testEmail, folderId);
    Logger.log('Retrieved: ' + JSON.stringify(result));
  } else {
    Logger.log('No wallets found to test retrieve');
  }
}
