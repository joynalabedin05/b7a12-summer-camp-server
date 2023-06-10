const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');

const app = express();
require('dotenv').config();

const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY);

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
    const usersCollection = client.db('summerCamp').collection('users');
    const classCollection = client.db('summerCamp').collection('classes');
    const instructorCollection = client.db('summerCamp').collection('instructor');
    const cartCollection = client.db('summerCamp').collection('carts');
    const paymentCollection = client.db('summerCamp').collection('payments');


     // veryfy admin
     const verifyAdmin = async(req, res, next)=>{
      const email = req.decoded.email;
      const query = {email: email};
      const user = await usersCollection.findOne(query);
      if(user?.role!=='admin'){
        return res.status(404).send({error: true, message: 'unauthorized access'});
      }
      next();
    };

    // veryfy instructor
    const verifyInstructor = async(req, res, next)=>{
      const email = req.decoded.email;
      const query = {email: email};
      const user = await usersCollection.findOne(query);
      if(user?.role!=='instructor'){
        return res.status(404).send({error: true, message: 'unauthorized access'});
      }
      next();
    };

    // jwt

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
    });

    app.post('/classes',verifyJWT, verifyInstructor, async(req,res)=>{
      const newItem = req.body;
      const result = await classCollection.insertOne(newItem);
      res.send(result);
    });


    // users related api
    app.get('/users', verifyJWT, verifyAdmin, async(req,res)=>{
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.post('/users', async(req,res)=>{
      const user = req.body;
      // console.log(user);
      const query = {email: user.email};
      const existingUser = await usersCollection.findOne(query);
      console.log(existingUser);
      if(existingUser){
        return res.send({message: 'user already exists'})
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // secuirty layers
    app.get('/users/admin/:email',verifyJWT, async(req, res)=>{
      const email = req.params.email;
      if(req.decoded.email !==email){
        res.send({admin: false});
      }
      const query = {email: email};
      const user = await usersCollection.findOne(query);
      const result = {admin: user?.role === 'admin'}
      res.send(result);
    });

    app.get('/users/instructor/:email',verifyJWT, async(req, res)=>{
      const email = req.params.email;
      if(req.decoded.email !==email){
        res.send({instructor: false});
      }
      const query = {email: email};
      const user = await usersCollection.findOne(query);
      const result = {instructor: user?.role === 'instructor'}
      res.send(result);
    });

    app.patch('/users/admin/:id', async(req,res)=>{
      const id = req.params.id;
      const filter = {_id: new ObjectId(id)};
      const updateDoc = {
        $set: {
          role: 'admin'
        },
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.patch('/users/instructor/:id', async(req,res)=>{
      const id = req.params.id;
      const filter = {_id: new ObjectId(id)};
      const updateDoc = {
        $set: {
          role: 'instructor'
        },
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

      // cart collection API
      app.get('/carts',verifyJWT, async(req,res)=>{
        const email= req.query.email;
        if(!email){
          res.send([]);
        }
        const decodedEmail = req.decoded.email;
        if(email !== decodedEmail){
          return  res.status(404).send({error: true, message: 'access forbidden'})
        }
        const query = {email: email};
        const result = await cartCollection.find(query).toArray();
        res.send(result);
      })
  
      app.post('/carts', async(req,res)=>{
        const item = req.body;
        // console.log(item)
        const result = await cartCollection.insertOne(item);
        res.send(result);
      });

      app.delete('/carts/:id', async (req,res)=>{
        const id = req.params.id;
        const query  = {_id : new ObjectId(id)};
        const result = await cartCollection.deleteOne(query);
        res.send(result);
      });

      // create payment intent
    app.post('/create-payment-intent',verifyJWT, async(req,res)=>{
      const {price} = req.body;
      const amount = parseInt(price*100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      })
      res.send({
        clientSecret: paymentIntent.client_secret,
      })
    });

    app.post('/payments',verifyJWT, async(req, res)=>{
      const payment = req.body;
      const insertResult = await paymentCollection.insertOne(payment);
      const query = {_id: {$in: payment.cartItems.map(id=>new ObjectId(id))}};
      const deleteResult = await cartCollection.deleteMany(query);
      res.send({insertResult, deleteResult});
    });

    app.get('/payments/:email',async(req,res)=>{
      const email = req.params.email;
      const query = {email : email};
      const result = await paymentCollection.find(query).toArray();
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