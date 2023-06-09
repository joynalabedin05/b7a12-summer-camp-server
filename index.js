const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
const jwt = require('jsonwebtoken');

const app = express();
require('dotenv').config();

const port = process.env.PORT || 5000;

// middleware

app.use(cors());
app.use(express.json());

// veryfy jwt
const verifyJWT = (req, res, next)=>{
  const authorization = req.headers.authorization;
  if(!authorization){
    return res.status(401).send({error: true, message: 'unauthorized access'}); 
  }
  const token = authorization.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded)=>{
    if(err){
      return res.status(404).send({error: true, message: 'unauthorized access'})
    }
    req.decoded = decoded;
    next();
  })
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ssvrn1a.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const classCollection = client.db('summerCamp').collection('classes');
    const instructorCollection = client.db('summerCamp').collection('instructor');

    app.post('/jwt', (req, res)=>{
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN,{expiresIn: '1h'});
      res.send({token});
    })

    app.get('/instructor', async(req,res)=>{
      const result  = await instructorCollection.find().toArray();
      res.send(result);
    })
    app.get('/classes', async(req,res)=>{
      const result  = await classCollection.find().toArray();
      res.send(result);
    })

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/',(req, res)=>{
    res.send('summer camp is running')
});

app.listen(port, ()=>{
    console.log(`summer camp is running on port ${port}`);
})