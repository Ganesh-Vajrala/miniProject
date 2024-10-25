const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const nodemailer = require("nodemailer");
const jwt  = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config()
const app = express();
app.use(cors());
app.use(express.json());
const baseUrl = process.env.PORT;

mongoose.connect(process.env.MONGODB_URL)
    .then(() => console.log("DB connected..."))
    .catch(err => console.log(err));

const credentialsSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
      },
      email: {
        type: String,
        required: true,
        unique: true,
      },
      password: {
        type: String,
        required: true,
      },
      role: {
        type: String,
        enum: ['lab_incharge', 'lab_programmer'],
        required: true,
      },
      labs_managed: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Lab', 
        },
      ],
      lab_managed: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lab',
        required: function() { return this.role === 'lab_programmer'; },
      },
      secretCode: {
        type: String,
    },
    });
    
const Credentials = mongoose.model('Credentials', credentialsSchema);

const LabSchema = new mongoose.Schema({
    name: {
      type: String,
      required: true,
    },
    location: {
      type: String,
      required: true,
    },
    capacity: {
      type: Number,
    },
    system_configuration: {
      ram: {
        type: String,
      },
      cpu: {
        type: String,
      },
      storage: {
        type: String,
      },
      os: {
        type: String,
      },
      num_systems: {
        type: Number,
      },
    },
    num_projectors: {
      type: Number,
      default: 0,
    },
    num_acs: {
      type: Number,
      default: 0,
    },
    num_wall_mounted_fans: {
      type: Number,
      default: 0,
    },
    lab_incharge: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Credentials',
      required:true,
    },
});
      
const Lab = mongoose.model('Lab', LabSchema);


const TimeSlotSchema = new mongoose.Schema({
    start_time: {
      type: String, 
      required: true,
    },
    end_time: {
      type: String,
      required: true,
    },
    booked_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Credentials',
      default: null,
    },
    course_name: {
      type: String,
      default: null,
    },
    vacant: {
      type: Boolean,
      default: true, 
    },
  });
  
  const DayScheduleSchema = new mongoose.Schema({
    day: {
      type: String,
      enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      required: true,
    },
    time_slots: [TimeSlotSchema], 
  });
  const LabScheduleSchema = new mongoose.Schema({
    lab_name: {
        type: String, 
        required: true,
      },
    start_date: {
      type: Date,
      required: true,
    },
    end_date: {
      type: Date,
      required: true,
    },
    weekly_schedule: [DayScheduleSchema], 
  });
  const LabSchedule = mongoose.model('LabSchedule', LabScheduleSchema);
  module.exports = LabSchedule;



app.post('/register/lab-incharge', async (req, res) => {
    const { username, email, password } = req.body;
  
    try {
      const existingUser = await Credentials.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: 'Email already exists.' });
      }
  
      const hashedPassword = await bcrypt.hash(password, 10);
      const labIncharge = new Credentials({
        username,
        email,
        password: hashedPassword,
        role: 'lab_incharge',
        labs_managed: [],
      });
  
      await labIncharge.save();
      res.status(201).json({ message: 'Lab in-charge registered successfully!' });
    } catch (error) {
      console.error('Error registering lab in-charge:', error);
      res.status(500).json({ message: 'Server error.' });
    }
  });

  app.post('/register/lab-programmer', async (req, res) => {
    const {
      username,
      email,
      password,
      lab_name, 
    } = req.body;
  
    try {
      const lab = await Lab.findOne({ name: lab_name });
      if (!lab) {
        return res.status(404).json({ message: 'Lab not found.' });
      }
      const existingUser = await Credentials.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: 'Email is already in use.' });
      }
      const existingLabProgrammer = await Credentials.findOne({
        lab_managed: lab._id,
        role: 'lab_programmer',
      });
      
      if (existingLabProgrammer) {
        return res.status(400).json({ message: 'This lab is already assigned to a programmer.' });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      const labProgrammer = new Credentials({
        username,
        email,
        password: hashedPassword,
        role: 'lab_programmer',
        lab_managed: lab._id,
      });
      await labProgrammer.save();
      res.status(201).json({
        message: 'Lab programmer account created successfully!',
        labProgrammer,
      });
    } catch (error) {
      console.error('Error creating lab programmer:', error);
      res.status(500).json({ message: 'Server error.' });
    }
  });


  app.post('/login', async (req, res) => {
    const { email, password } = req.body;
  
    try {
      const user = await Credentials.findOne({ email });
  
      if (!user) {
        return res.status(401).json({ message: 'Invalid credentials.' });
      }
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid credentials.' });
      }
      const token = jwt.sign({ id: user._id, role: user.role },process.env.SECRET_TOKEN);
      res.json({
        token,
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          role:user.role,
          labs_managed: user.labs_managed,
        },
      });
    } catch (error) {
      console.error('Error logging in:', error);
      res.status(500).json({ message: 'Server error.' });
    }
  });


  app.post('/forgotPassword', async (request, response) => {
    const { email } = request.body;
    try {
        const secretCode = Math.floor(100000 + Math.random() * 900000).toString();
        const user = await Credentials.findOneAndUpdate(
            { email },
            { $set: { secretCode } },
            { new: true }
        );

        if (!user) {
            return response.status(404).json({ error: 'User not found' });
        }

        var transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.USER_MAIL,
                pass: process.env.USER_PASSWORD
            }
        });

        var mailOptions = {
            from: process.env.USER_MAIL,
            to: email,
            subject: 'Account Password Reset Code',
            text: `Your password reset code is: ${secretCode}`
        };

        await transporter.sendMail(mailOptions);
        response.send('Email sent successfully');
    } catch (err) {
        response.status(500).json({ error: err.message });
    }
});

app.post('/resetPassword', async (request, response) => {
    const { email, secretCode, newPassword } = request.body;
    try {
        const user = await Credentials.findOne({ email, secretCode });
        if (!user) {
            return response.status(401).json({ error: 'Invalid secret code' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedPassword;
        user.secretCode = undefined;
        await user.save();

        response.json({ message: 'Password reset successful' });
    } catch (err) {
        response.status(500).json({ error: err.message });
    }
});
   



app.post('/labs', async (req, res) => {
  const {
    name,
    location,
    capacity,
    system_configuration,
    num_projectors,
    num_acs,
    num_wall_mounted_fans,
    lab_incharge,
  } = req.body;

  try {
    const existingLab = await Lab.findOne({ name });
    if (existingLab) {
      return res.status(400).json({ message: 'Lab already exists.' });
    }

    const lab = new Lab({
      name,
      location,
      capacity: capacity || 0,
      system_configuration: system_configuration || {},
      num_projectors: num_projectors || 0,
      num_acs: num_acs || 0,
      num_wall_mounted_fans: num_wall_mounted_fans || 0,
      lab_incharge,
    });
    await lab.save();
    await Credentials.findByIdAndUpdate(lab_incharge, {
      $push: { labs_managed: lab._id },
    });
    res.status(201).json({ message: 'Lab created successfully!', lab });
  } catch (error) {
    console.error('Error creating lab:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});




app.post('/labs/schedule', async (req, res) => {
    const { lab_name, start_date, end_date, weekly_schedule } = req.body;

    try {
      const existingSchedule = await LabSchedule.findOne({
        lab_name,
        $or: [
          {
            start_date: { $lte: end_date },
            end_date: { $gte: start_date }
          }
        ],
        'weekly_schedule.day': { $in: weekly_schedule.map((day) => day.day) }
      });
  
      if (existingSchedule) {
        return res.status(400).json({ message: 'Schedule is already allotted for this lab during the specified period.' });
      }
  
      const newSchedule = new LabSchedule({
        lab_name,
        start_date,
        end_date,
        weekly_schedule,
      });
  
      await newSchedule.save();
      res.status(201).json({ message: 'Lab schedule created successfully!', schedule: newSchedule });
    } catch (error) {
      console.error('Error creating lab schedule:', error);
      res.status(500).json({ message: 'Server error.' });
    }
  });
  
  app.post('/labs/get-schedule', async (req, res) => {
    const { lab_name, date, day } = req.body;
  
    try {
      
      const labSchedule = await LabSchedule.findOne({ lab_name });
  
      if (!labSchedule) {
        return res.status(404).json({ message: 'Lab schedule not found.' });
      }
  
      const startDate = new Date(labSchedule.start_date);
      const endDate = new Date(labSchedule.end_date);
      const requestedDate = new Date(date);
  
      if (requestedDate < startDate || requestedDate > endDate) {
        return res.status(400).json({ message: 'No schedule assigned for this date.' });
      }
  
      const daySchedule = labSchedule.weekly_schedule.find(s => s.day.toLowerCase() === day.toLowerCase());
  
      if (!daySchedule) {
        return res.status(404).json({ message: 'Schedule not found for this day.' });
      }
  
      res.status(200).json({ schedule: daySchedule });
    } catch (error) {
      console.error('Error retrieving lab schedule:', error);
      res.status(500).json({ message: 'Server error.' });
    }
  });


app.post('/labs/data', async (req, res) => {
  const { lab_incharge } = req.body;
  console.log("--->",lab_incharge);
  try {
    const labs = await Lab.find({ lab_incharge: lab_incharge});

    if (!labs || labs.length === 0) {
      return res.status(404).json({ message: 'No labs found for this lab in-charge.' });
    }

    res.status(200).json({ labs });
  } catch (error) {
    console.error('Error fetching labs:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

app.get("/", (request, response) => {
  response.send("welcome to Server");
});


const PORT = process.env.PORT;

app.listen(PORT, () => console.log("server running"));
