const mongoose = require('mongoose');
const _ = require('lodash');
const jwt = require('jsonwebtoken');
const crypto = require("crypto");
const bcrypt = require("bcryptjs");



const jwtSecret = '03457479307133192241kdlknfks9075078651';

const UserSchema = new mongoose.Schema({
    email:{
        type: String,
        required: true,
        minlength: 1,
        trim: true,
        unique: true,
    },
    password:{
        type: String,
        required: true,
        minlength: 6,
        trim: true,
    },
    sessions:[{
        token: {
            type: String,
            required: true
        },
        expiresAt: {
            type: Number,
            required: true
        },
    }]
});

UserSchema.methods.toJSON = function (){
    const user = this;
    const userObject = user.toObject();

    //retourner le doc sans le mdp & la session
    return _.omit(userObject,['password', 'sessions']);
};

UserSchema.methods.generateAccessAuthToken = function (){
    const user = this;
    return new Promise((resolve, reject) => {
        jwt.sign({_id: user._id.toHexString()}, jwtSecret, {expiresIn: "30m"}, (err, token) =>{
            if (!err) {
                resolve(token);
            } else {
                // si error
                reject();
            };
        });
    });
};

UserSchema.methods.generateRefreshAuthToken = function (){
    return new Promise((resolve, reject) => {
         crypto.randomBytes(64,(err, buf) =>{
             if(!err){
                 let token = buf.toString('hex');
                 return resolve(token);
             }
         })
    })
};

UserSchema.methods.createSession = function (){
     let user = this;
     return user.generateRefreshAuthToken().then((refreshToken) => {
         return saveSessionToDatabase(user, refreshToken);
     }).then((refreshToken) => {
          // enregistrer avec succes dans la db
         return refreshToken
     }).catch((e) => {
         return Promise.reject('Failed to save session to the DB. \n' + e);
     })
};


UserSchema.statics.getJWTSecret = () => {
    return jwtSecret;
}



UserSchema.statics.findByIdAndToken = function (_id, token) {
     // trouver l'user avec son ID et son Token
    const User = this

    return User.findOne({
        _id,
        'sessions.token': token
    });
};

UserSchema.statics.findByCredentials = function (email, password){
    let User = this;
    return User.findOne({email}).then((user) => {
        if(!user) return Promise.reject();

        return new Promise((resolve, reject ) =>{
            bcrypt.compare(password, user.password, (err, res)=>{
                if(res) resolve(user);
                else {
                    reject();
                }
            })
        })
    });
};

UserSchema.statics.hasRefreshTokenExpired = (expiresAt) =>{
    let secondsSinceEpoch = Date.now() / 1000;
    if (expiresAt > secondsSinceEpoch){
        // n'est pas expiré
        return false;
    } else {
        // est expiré
        return true;
    }
};


//MIDLEWARE
UserSchema.pre('save', function (next){
    let user = this;
    let costFactor = 10;

    if (user.isModified('password')){
        // si le password est modifier/changer =>
        bcrypt.genSalt(costFactor, (err, salt) => {
            bcrypt.hash(user. password, salt, (err, hash) => {
                user.password = hash;
                next();
            })
        })
    }else {
        next();
    }
});


let saveSessionToDatabase = (user, refreshToken) => {
    // Enregistrer la session dans la db
    return new Promise((resolve, reject) => {
        let expiresAt = generateRefreshTokenExpiryTime();

        user.sessions.push({'token': refreshToken, expiresAt});

        user.save().then(() => {
            // session enregistrer avec succes
             return resolve(refreshToken);
        }).catch((e) => {
            reject(e)
        })
    })
};

let generateRefreshTokenExpiryTime = () => {
    let daysUntilExpire = "10";
    let secondsUntilExpire = ((daysUntilExpire * 24) * 60) * 60;
    return ((Date.now() / 1000) + secondsUntilExpire);
};

const User = mongoose.model('User', UserSchema);

module.exports = {User}