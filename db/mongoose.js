// LOGIQUE DE CONNECTION A LA BASE DE DONNEES MONGODB

const mongoose = require("mongoose")
mongoose.Promise = global.Promise
mongoose.connect(process.env.MONGOCONNECT, {useNewUrlParser: true}).then(() =>{
    console.log("Connected to MongoDB succesfully")
}).catch((e)=>{
    console.log("Error while attempting to connect to MongoDB");
    console.log(e)
});


//TO PREVENT DEPRECIATION WARNINGS
mongoose.set('useCreateIndex', true)
mongoose.set( 'useFindAndModify', false)

module.exports = {
    mongoose
}