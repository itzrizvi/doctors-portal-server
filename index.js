const express = require('express');
var cors = require('cors');
const app = express();
require('dotenv').config();
const admin = require("firebase-admin");
const { MongoClient, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET);
const fileUpload = require('express-fileupload');
const port = process.env.PORT || 5000;


const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

// Middle Ware
app.use(cors());
app.use(express.json());
app.use(fileUpload());

// DB CREDENTIALS
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.w9ewo.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

async function verfiyToken(req, res, next) {
    if (req.headers?.authorization?.startsWith('Bearer ')) {
        const token = req.headers.authorization.split(' ')[1];

        try {
            const decodedUser = await admin.auth().verifyIdToken(token);
            req.decodedEmail = decodedUser.email;
        } catch {

        }
    }
    next();
}

async function run() {
    try {
        await client.connect();
        const database = client.db('doctors_portal');
        const doctorsCollection = database.collection('doctors');
        const appointmentsCollection = database.collection('appointments');
        const usersCollection = database.collection('users');
        console.log('DB CONNECTED');

        // APPOINTMENTS POST
        app.post('/appointments', async (req, res) => {
            const appointment = req.body;
            const result = await appointmentsCollection.insertOne(appointment);
            res.json(result)
        });

        // GET APPOINTMENT BY SPECIFIC ID
        app.get('/appointments/:id', verfiyToken, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await appointmentsCollection.findOne(query);
            res.json(result);

        });

        // All APPOINTMENT GET
        app.get('/appointments', verfiyToken, async (req, res) => {
            const email = req.query.email;
            const date = req.query.date;
            const query = { email: email, date: date };
            const cursor = appointmentsCollection.find(query);
            const appointments = await cursor.toArray();
            res.json(appointments);
        });

        // Update appointment for Stripe
        app.put('/appointments/:id', async (req, res) => {
            const id = req.params.id;
            const payment = req.body;
            const filter = { _id: ObjectId(id) };
            const updateDoc = {
                $set: {
                    payment: payment
                }
            };
            const result = await appointmentsCollection.updateOne(filter, updateDoc);
            res.json(result);
        });

        // SAVE USER DATA
        app.post('/users', async (req, res) => {
            const user = req.body;
            const result = await usersCollection.insertOne(user);
            res.json(result);
        });

        app.put('/users', async (req, res) => {
            const user = req.body;
            const filter = { email: user.email };
            const options = { upsert: true };
            const updateDoc = { $set: user };
            const result = await usersCollection.updateOne(filter, updateDoc, options);
            res.json(result);
        })

        // FOR ADMIN ROLE
        app.put('/users/admin', verfiyToken, async (req, res) => {
            const user = req.body;
            const requester = req.decodedEmail;
            if (requester) {
                const requesterAcc = await usersCollection.findOne({ email: requester });
                if (requesterAcc.role === 'Admin') {
                    const filter = { email: user.email };
                    const updateDoc = { $set: { role: 'Admin' } };
                    const result = await usersCollection.updateOne(filter, updateDoc);
                    res.json(result);
                }
            } else {
                res.status(403).json({ message: 'Not Have Access' });

            }
        });

        // FOR LOGGED IN USER CHECK
        app.get('/users/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            let isAdmin = false;
            if (user?.role === 'Admin') {
                isAdmin = true;
            }
            res.json({ admin: isAdmin });
        });

        // Intent API FOR STRIPE
        app.post('/create-payment-intent', verfiyToken, async (req, res) => {
            const paymentInfo = req.body;
            const amount = paymentInfo.price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                currency: 'usd',
                amount: amount,
                payment_method_types: ['card']
            });

            res.json({ clientSecret: paymentIntent.client_secret });
        });

        // POST API for doctor adding
        app.post('/doctors', async (req, res) => {
            const name = req.body.name;
            const email = req.body.email;
            const img = req.files.image;
            const imgData = img.data;
            const encodedImg = imgData.toString('base64');
            const imgBuffer = Buffer.from(encodedImg, 'base64');
            const doctor = {
                name,
                email,
                image: imgBuffer
            }
            const result = await doctorsCollection.insertOne(doctor);
            res.json(result);
        });

        // GET API for doctors
        app.get('/doctors', async (req, res) => {
            const cursor = doctorsCollection.find({});
            const doctors = await cursor.toArray();
            res.json(doctors);
        })

    }
    finally {
        // await client.close();
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Hello From Doctors Portal!')
})

app.listen(port, () => {
    console.log(`Listening at ${port}`)
})