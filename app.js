const express = require('express');
const multer = require('multer');
const path = require('path');
const https = require('https');
const fs = require('fs');
const bcrypt = require('bcrypt');
const WebSocket = require('ws');
const url = require('url');
const fs_pro = fs.promises;
const app = express();


const PORT = 2531;
const usersFilePath = "C:\\Users\\ezra_hao\\JVP_Backend\\users.json";
const parseJson = express.json();

// Https server:
const sslOptions = {
  cert: fs.readFileSync('C:\\Users\\ezra_hao\\SSL\\cert.pem'),
  key: fs.readFileSync('C:\\Users\\ezra_hao\\SSL\\cert.key')
};




// Middleware to ensure directory exists
const ensureDirExists = (dirPath) => {
  if (!fs.existsSync(dirPath)){
      fs.mkdirSync(dirPath, { recursive: true });
  }
};


// Configure storage  and file filter for .mp4 files
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const username = req.body.username;
    const userDir = path.join('Z:\\Incoming_Video', username);
    ensureDirExists(userDir);  // Ensure the directory exists
    cb(null, userDir);  // Use the user-specific directory
  },
  filename: function (req, file, cb) {
    const now = new Date();
    const timestamp = now.getFullYear() + '_' + (now.getMonth() + 1) + '_' + now.getDate() + '_' + now.getHours() + '_' + now.getMinutes() + '_' + now.getSeconds();
    cb(null, path.basename(file.originalname, path.extname(file.originalname)) + '_' + timestamp + path.extname(file.originalname))
  }
});

const fileFilter = (req, file, cb) => {
    if (file.mimetype === 'video/mp4' || file.originalname.endsWith('.mp4')) {
        cb(null, true);
    } else {
        cb(new Error('Only .mp4 files are allowed!'), false);
    }
};
  
const upload = multer({ storage: storage, fileFilter: fileFilter });


app.post('/videoupload', upload.single('video'), (req, res) => {
    console.log("accept a video upload request");
    if (!req.file) {
      return res.status(400).json({message: 'No Video Found and Uploaded!'});
    }


    // hanlde additional data for username and skincolor
    const additionalData = {
      username: req.body.username,
      skinColor: req.body.skinColor // Assuming skinColor is sent as a string
    };  
    const additionalDataString = JSON.stringify(additionalData);
    const txtFilePath = path.join(req.file.destination, `${path.basename(req.file.filename, path.extname(req.file.filename))}.txt`);
  
    fs.writeFile(txtFilePath, additionalDataString, (writeErr) => {
      if (writeErr) {
        console.error(writeErr);
        return res.status(500).json({ message: 'Failed to write additional data to file.' });
      }
      console.log('Additional data written to file:', txtFilePath);
      // Assuming the upload is successful, send back the file location.
      res.json({message: 'Nice! Video uploaded successfully!', location: req.file.path});
    });
  });




app.get('/fetchData/:id', async (req, res) => {
  const id = req.params.id;
  console.log("Someone trying to get ID: "+id);
  const directoryPath = path.join('Z:\\Outputs', id); // Adjust for the actual path
  try {
    await fs_pro.access(directoryPath, fs_pro.constants.F_OK);
    const subFolders = await fs_pro.readdir(directoryPath, { withFileTypes: true });
    
    const results = {};

    for (const dirent of subFolders) {
      if (dirent.isDirectory()) {
        const subFolderPath = path.join(directoryPath, dirent.name);
        const content = await fs_pro.readFile(path.join(subFolderPath, 'results.txt'), 'utf8');
        const resultObject = JSON.parse(content);
        results[dirent.name] = resultObject;
      }
    }
    res.json(results);    
  } catch (error) {
    if (error.code === 'ENOENT') {
      // If the directory does not exist, return 404
      console.error('Directory does not exist: ', directoryPath);
      res.status(404).json({ message: 'The user has not uploaded any videos' });
    } else {
      // For other errors, return 500
      console.error('Failed to read data', error);
      res.status(500).json({ message: 'Failed to read data', error: error.message });
    }
  }
});

// Request Report Image
app.get('/getReportImage/:username/:filename', (req, res) => {
  const { username, filename } = req.params;
  const imagePath = path.join('Z:\\Outputs', username, filename, `${filename}.jpg`);
  console.log("someone tring to get image: "+imagePath);
  // Check if the image exists
  if (fs.existsSync(imagePath)) {
      // Send the image file to the client
      res.sendFile(imagePath);
  } else {
      // Image not found, send a 404 response
      res.status(404).send('Image not found');
  }
});




// User login and registration part:
async function readUsersFile() {
  try {
    const data = await fs_pro.readFile(usersFilePath, 'utf8');
    // Check if the file is empty and return an empty object if it is
    if (data.trim() === '') {
      return {};
    }

    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {}; // If the file doesn't exist, return an empty object
    }
    throw error;
  }
}

async function writeUsersFile(users) {
  await fs_pro.writeFile(usersFilePath, JSON.stringify(users, null, 2), 'utf8');
}

// Register endpoint
app.post('/register', parseJson, async (req, res) => {
  const { username, password, skinColor } = req.body;
  const users = await readUsersFile();
  
  if (users[username]) {
    return res.status(400).json({ message: 'Username already exists' });
  }
  
  const hashedPassword = await bcrypt.hash(password, 10);
  
  users[username] = { password: hashedPassword, skinColor: skinColor };
  await writeUsersFile(users);
  
  res.status(201).json({ message: 'User registered successfully' });
});

// Login endpoint
app.post('/login', parseJson, async (req, res) => {
  const { username, password } = req.body;
  
  const users = await readUsersFile();
  
  if (!users[username]) {
    return res.status(400).json({ message: 'Username does not exist' });
  }
  
  const user = users[username];
  const passwordMatch = await bcrypt.compare(password, user.password);
  
  if (passwordMatch) {
    res.json({ message: 'User logged in successfully', username: username, skinColor: user.skinColor});
  } else {
    res.status(401).json({ message: 'Password is incorrect' });
  }
});


app.get('/notifyUser/:id', (req, res) => {
  const id = String(req.params.id);
  // const { id, message } = req.body;
  console.log("Someone wanna notrify user: "+id+", current wsConnections: " + [...wsConnections.keys()])
  ws = wsConnections.get(id)
  console.log("wsConnections.get("+id+"): " + ws)
  if(!ws){
    console.log("Failed to notify user! user with id "+id+" is not connecting!" )
    res.status(404).json({ message: "Failed to notify user! User with id "+id+" is not connecting!" });
  }
  else{
    res.json({ message: 'Successfully Notified User'});
    ws.send("Your Report Status Changed!")
  }
  
});


const httpsServer = https.createServer(sslOptions, app);




// WebSocket Server Part
const ws_server = new WebSocket.Server({ server: httpsServer });
const wsConnections = new Map();

ws_server.on('connection', function connection(ws, request) {
  console.log("get an new connection")
  const userID = url.parse(request.url, true).query.id;

  wsConnections.set(userID, ws);
  console.log('new user joined, Current users in connection: ' + [...wsConnections.keys()]);

  ws.on('close', () => {
    // Remove the connection from the map when it's closed
    wsConnections.delete(userID);
    console.log("delete one connection with: "+ userID + "Connections left: " + [...wsConnections.keys()])
  });
  ws.on('error', function error(err) {
    console.log('WebSocket error:', err);
  });
});






httpsServer.listen(PORT, () => {
  console.log(`HTTPS Server is running on https://localhost:${PORT}`);
}).on('error', (e) => {
  console.error(`Failed to start server: ${e.message}`);
});
