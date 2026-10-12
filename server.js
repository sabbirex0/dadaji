const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// ডাটাবেস স্টোরেজ (মেমোরিতে রেজিস্টার্ড ইউজার রাখার জন্য)
// Key: username, Value: { username, name, phone }
const users = new Map();
// Key: username, Value: socket.id
const onlineUsers = new Map();

app.get('/', (req, res) => {
  res.send('Dadaji Messenger Backend with User Search is Running!');
});

io.on('connection', (socket) => {
  console.log('Client connected: ' + socket.id);

  // ১. নতুন ইউজার রেজিস্ট্রেশন / প্রোফাইল তৈরি
  socket.on('register_user', (data) => {
    // data = { name, username, phone }
    const { name, username, phone } = data;

    if (!username || !phone || !name) {
      socket.emit('register_response', { success: false, message: 'সবগুলো তথ্য সঠিকভাবে প্রদান করুন!' });
      return;
    }

    const cleanUsername = username.trim().toLowerCase();

    // চেক করা হচ্ছে ইউনিক ইউজারনেম কিনা
    if (users.has(cleanUsername)) {
      socket.emit('register_response', { success: false, message: 'এই Username টি ইতোমধ্যে ব্যবহূত হয়েছে! অন্য একটি চেষ্টা করুন।' });
      return;
    }

    // ইউজার সেভ করা
    const userInfo = { name, username: cleanUsername, phone: phone.trim() };
    users.set(cleanUsername, userInfo);
    onlineUsers.set(cleanUsername, socket.id);
    socket.username = cleanUsername;

    console.log(`Registered: ${name} (@${cleanUsername}) - ${phone}`);
    socket.emit('register_response', { success: true, message: 'রেজিস্ট্রেশন সফল হয়েছে!', user: userInfo });
  });

  // ২. পুরনো ইউজার লগইন করা
  socket.on('login_user', (data) => {
    const { username } = data;
    const cleanUsername = username.trim().toLowerCase();

    if (users.has(cleanUsername)) {
      onlineUsers.set(cleanUsername, socket.id);
      socket.username = cleanUsername;
      const userInfo = users.get(cleanUsername);
      socket.emit('login_response', { success: true, message: 'লগইন সফল!', user: userInfo });
    } else {
      socket.emit('login_response', { success: false, message: 'ইউজার পাওয়া যায়নি! প্রথমে রেজিস্টার করুন।' });
    }
  });

  // ৩. সার্চ অপশন (Username বা Phone Number দিয়ে সার্চ করা)
  socket.on('search_user', (data) => {
    const { query } = data; // query হতে পারে username অথবা phone number
    const searchQuery = query.trim().toLowerCase();
    
    let foundUser = null;

    for (let [uname, uinfo] of users.entries()) {
      if (uname === searchQuery || uinfo.phone === searchQuery) {
        foundUser = uinfo;
        break;
      }
    }

    if (foundUser) {
      socket.emit('search_result', { success: true, user: foundUser });
    } else {
      socket.emit('search_result', { success: false, message: 'এই নামে বা নম্বরে কোনো ইউজার পাওয়া যায়নি!' });
    }
  });

  // ৪. প্রাইভেট মেসেজ পাঠানো
  socket.on('send_private_message', (data) => {
    // data = { senderUsername, receiverUsername, message }
    const { senderUsername, receiverUsername, message } = data;
    const cleanReceiver = receiverUsername.trim().toLowerCase();
    const recipientSocketId = onlineUsers.get(cleanReceiver);

    if (recipientSocketId) {
      io.to(recipientSocketId).emit('receive_private_message', {
        senderUsername: senderUsername,
        message: message
      });
    } else {
      socket.emit('system_message', {
        error: true,
        message: `'${receiverUsername}' বর্তমানে অফলাইনে আছেন।`
      });
    }
  });

  // ৫. ডিসকানেক্ট হলে
  socket.on('disconnect', () => {
    if (socket.username) {
      onlineUsers.delete(socket.username);
      console.log(`User disconnected: ${socket.username}`);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
