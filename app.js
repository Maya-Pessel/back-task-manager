if(process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}

const express = require("express");

const app = express();
const {mongoose} = require("./db/mongoose");
const jwt = require('jsonwebtoken');

const PORT = process.env.PORT || 3000

const bodyParser = require('body-parser');

const cors = require('cors');
// Models
const{ List, Task, User} = require('./db/models');
// MIDDLEWARES

app.use(bodyParser.json());

// CORS

app.use(cors());



let authenticate = (req, res, next)=>{
    let token = req.header('x-access-token')

    console.log(token)

    jwt.verify(token, User.getJWTSecret(), (err, decoded)=>{
        if(err){
            // il y a une erreur, JWT invalide : ne pas authentifier
            res.status(401).send(err)
        }else {
            // JWT valide
            req.user_id = decoded._id;
            next()
        }
    });
}


// Verifier le refresh token
let verifySession = (req, res, next)=>{
    //recuperer le refresh token du header de la requette
    let refreshToken = req.header('x-refresh-token');

    //recuperer l'id du header de la requette
    let _id = req.header('_id');

    User.findByIdAndToken(_id, refreshToken).then((user) =>{
        if(!user){
            return Promise.reject({
                'error': 'User not found'
            });
        }
        // refresh token existe dans la db mais verifier que ce n'est pas expiré
        //si le code est lu, l'user a ete trouvé
        req.user_id = user._id;
        req.userObject = user;
        req.refreshToken = refreshToken;

        let isSessionValid = false;

        user.sessions.forEach((session)=>{
            if (session.token === refreshToken){
                // regarder si la session a expiré
                if (User.hasRefreshTokenExpired(session.expiresAt) === false){
                    // pas expiré
                    isSessionValid = true;
                }
            }
        });

        if (isSessionValid){
            //session est valide
            next()
        }else {
            //la session n'est pas valide
            return Promise.reject({
                'error': 'Refresh token has expired or the session is invalid'
            })
        }
    }).catch((e)=>{
        res.status(401).send(e)
    })
}

// END MIDDLEWARES




// GET : OBTENIR LES LISTES
app.get("/lists", authenticate, (req, res)=>{
    //Retourner un tableau de toute les liste de la base de donnée
    List.find({
        _userId: req.user_id
    }).then((lists)=>{
        res.send(lists);
    }).catch((e)=>{
        res.send(e)
    })
});

// POST : CREER UNE LISTE

app.post('/lists', authenticate,(req, res)=>{
    //Créer une nouvelle liste et retourner la nouvelle liste
    let title = req.body.title;

    let newList = new List({
        title,
        _userId: req.user_id
    });
    newList.save().then((listDoc)=>{
        res.send(listDoc);
    });

});

// PATCH : UPDATE UNE LISTE SPECIFIQUE

app.patch('/lists/:id', authenticate,(req, res)=>{
    //Update la list avec les nouvelles valeurs
    List.findOneAndUpdate({_id: req.params.id, _userId: req.user_id },{
        $set: req.body
    }).then(() => {
        res.send({'message': 'Liste mise a jour'});
    });
});

// DELETE : SUPPRIMER UNE LISTE

app.delete('/lists/:id', authenticate, (req, res)=>{
    //Supprimer
    List.findOneAndRemove({
        _id: req.params.id,
        _userId: req.user_id
    }).then((removedListDoc)=>{
        res.send(removedListDoc);

        // supprimer toutes les taches de la liste
        deleteTaskFromList(removedListDoc._id)
    })
});


// GET : RECUPERER TOUTES LES TACHES D'UNE LISTE
app.get('/lists/:listId/tasks', authenticate, (req, res) => {
    // Retourner toutes les tâches d'une liste specifique
    Task.find({
        _listId: req.params.listId
    }).then((tasks)=>{
        res.send(tasks);
    });
});

// POST : CREER UNE NOUVELLE TACHE DANS UNE LISTE SPECIFIQUE
app.post('/lists/:listId/tasks', authenticate,(req, res) => {
    // Créer une nouvelle tâche dans une liste spécifique

    List.findOne({
        _id: req.params.listId,
        _userId: req.user_id
    }).then((list) =>{
        if(list){
            return true
        }
        return false
    }).then((canCreateTask) =>{
        if(canCreateTask){
            let newTask = new Task({
                title: req.body.title,
                _listId: req.params.listId
            });
            newTask.save().then((newTaskDoc) => {
                res.send(newTaskDoc);
            });
        }else {
            res.sendStatus(404);
        }
    })

});

// PATCH : MODIFIER UNE TACHE DANS UNE LISTE SPECIFIQUE

app.patch('/lists/:listId/tasks/:taskId', authenticate, (req, res) =>{
    // Update une tache specifique via son id
    List.findOne({
        _id: req.params.listId,
        _userId: req.user_id
    }).then((list)=>{
        if(list){
            return true
        }
        return false
    }).then((canUpdateTasks)=>{
        if(canUpdateTasks){
            Task.findOneAndUpdate({
                _id: req.params.taskId,
                _listId: req.params.listId
            },{
                $set: req.body
              }
            ).then(()=>{
                res.send({message: 'updated successfully'})
            })
        } else {
            res.sendStatus(404)
        }
    })
})

// DELETE : SUPPRIMER UNE TACHE DANS UNE LISTE SPECIFIQUE

app.delete('/lists/:listId/tasks/:taskId', authenticate, (req, res)=>{
    List.findOne({
        _id: req.params.listId,
        _userId: req.user_id
    }).then((list)=>{
        if(list){
            return true
        }
        return false
    }).then((canDeleteTasks)=>{
        if (canDeleteTasks){
            Task.findOneAndRemove({
                _id: req.params.taskId,
                _listId: req.params.listId
            }).then((removedTaskDoc) => {
                res.send(removedTaskDoc);
            })
        }else{
            res.sendStatus(404)
        }
    })
});

// User routes

// POST: SIGN UP
app.post('/users', (req, res) => {
    let body = req.body;
    let newUser = new User(body);


    newUser.save().then(() =>{
        return newUser.createSession()
    }).then((refreshToken) =>{
        //session créee avec succes
        return newUser.generateAccessAuthToken().then((accessToken) =>{
            return{accessToken, refreshToken}
        });
    }).then((authTokens) => {
        res
            .header('x-refresh-token', authTokens.refreshToken)
            .header('x-access-token', authTokens.accessToken)
            .send(newUser)
    }).catch((e) => {
        res.status(400).send(e)
    });
});

// LOG IN
app.post('/users/login', async(req, res) => {
    let email = req.body.email;
    let password = req.body.password;

    // User.findByCredentials(email, password).then((user) => {
    //     return user.createSession().then((refreshToken) => {
    //         // Session créee avec succes
    //         // now we geneate an access auth token for the user

    //         return user.generateAccessAuthToken().then((accessToken) => {
    //             return { accessToken, refreshToken }
    //         });
    //     }).then((authTokens) => {
    //         response
    //             .header('x-refresh-token', authTokens.refreshToken)
    //             .header('x-access-token', authTokens.accessToken)
    //             .send(user);
    //     })
    // }).catch((e) => {
    //     res.send(e)
    // });

    const userTest = await User.findByCredentials(email,password)
    if(userTest) {
        const refreshToken = await userTest.createSession()
        const accessToken = await userTest.generateAccessAuthToken()
        userTest.accessToken = accessToken;
        userTest.refreshToken = refreshToken;
        res
            .header('x-refresh-token', refreshToken)
            .header('x-access-token', accessToken)
            .status(200)
            .send(userTest)
    }else{
        res.json({
            "error":"something went wrong"
        })
    }

});

app.get("/",(req,res) =>{
    res.json({
        "message":"Welcome to the API"
    })
})


app.get('/users/me/access-token', verifySession, (req, res)=>{
    // l'user est auth
    req.userObject.generateAccessAuthToken().then((accessToken)=>{
        res.header('x-access-token', accessToken).send({accessToken});
    }).catch((e)=>{
        res.status(400).send(e);
    })
})


let deleteTaskFromList = (_listId) =>{
    Task.deleteMany({
        _listId
    }).then(()=>{
        console.log('Task from' + _listId + "were deleted")
    })
}


app.listen(PORT, () =>{
    console.log('Server is listening : 3000')
});

