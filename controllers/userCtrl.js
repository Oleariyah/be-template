const Users = require('../models/userModel')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const sendMail = require('./sendMail')

const { google } = require('googleapis')
const { OAuth2 } = google.auth
const fetch = require('node-fetch')

const client = new OAuth2(process.env.MAILING_SERVICE_CLIENT_ID)
const { CLIENT_URL } = process.env

const userCtrl = {

    register: async (req, res) => {
        try {
            const { name, email, password } = req.body
            if (!name || !email || !password)
                return res.status(400).json({ message: "Please fill in all fields." })

            if (!validateEmail(email))
                return res.status(400).json({ message: "Please, provide a valid email." })

            const user = await Users.findOne({ email })
            if (user) return res.status(400).json({ message: "The email provided has already been registered." })

            if (!validatePassword(password))
                return res.status(400).json({ message: "Password must contain a number, uppercase string, lowercase string, and a special character." })

            const passwordHash = await bcrypt.hash(password, 12)
            const newUser = {
                name, email, password: passwordHash
            }

            const activation_token = createActivationToken(newUser)
            const url = `${CLIENT_URL}/#/activate/${activation_token}`
            sendMail(email, url, "Verify your email address")
            res.json({ message: "Your registeration was Success! A verification email has been sent to the email address provided." })
        } catch (err) {
            return res.status(500).json({ message: err.message })
        }
    },

    activateEmail: async (req, res) => {
        try {
            const { activation_token } = req.body;
            const user = jwt.verify(activation_token, process.env.ACTIVATION_TOKEN_SECRET)
            const { name, email, password } = user
            const check = await Users.findOne({ email })
            if (check) return res.status(400).json({ message: "The email provided has already been registered." })
            const newUser = new Users({
                name, email, password
            })

            await newUser.save()
            res.json({ message: "Your account has been activated!" })
        } catch (err) {
            return res.status(500).json({ message: err.message })
        }
    },

    login: async (req, res) => {
        try {
            const { email, password } = req.body
            const user = await Users.findOne({ email })
            if (!user) return res.status(400).json({ message: "This user does not exist." })
            const isMatch = await bcrypt.compare(password, user.password)
            if (!isMatch) return res.status(400).json({ message: "Password is incorrect." })
            const refresh_token = createRefreshToken({ id: user._id })
            res.cookie('refreshtoken', refresh_token, {
                httpOnly: true,
                path: '/user/refresh_token',
                maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
            })
            res.json({ message: "Login success!" })
        } catch (err) {
            return res.status(500).json({ message: err.message })
        }
    },

    getAccessToken: (req, res) => {
        try {
            const rf_token = req.cookies.refreshtoken;
            if (!rf_token) return res.status(400).json({ message: "Please login now!" })

            jwt.verify(rf_token, process.env.REFRESH_TOKEN_SECRET, (err, user) => {
                if (err) return res.status(400).json({ message: "Please login now!" })

                const access_token = createAccessToken({ id: user.id })
                res.json({ access_token })
            })
        } catch (err) {
            return res.status(500).json({ message: err.message })
        }
    },

    forgotPassword: async (req, res) => {
        try {
            const { email } = req.body
            const user = await Users.findOne({ email })
            if (!user) return res.status(400).json({ message: "This user does not exist." })

            const access_token = createAccessToken({ id: user._id })
            const url = `${CLIENT_URL}/user/reset/${access_token}`

            sendMail(email, url, "Reset your password")
            res.json({ message: "Re-send the password, please check your email." })
        } catch (err) {
            return res.status(500).json({ message: err.message })
        }
    },

    resetPassword: async (req, res) => {
        try {
            const { password } = req.body
            const passwordHash = await bcrypt.hash(password, 12)

            await Users.findOneAndUpdate({ _id: req.user.id }, {
                password: passwordHash
            })

            res.json({ message: "Your password was successfully changed!" })
        } catch (err) {
            return res.status(500).json({ message: err.message })
        }
    },

    getUserInfor: async (req, res) => {
        try {
            const user = await Users.findById(req.user.id).select('-password')

            res.json(user)
        } catch (err) {
            return res.status(500).json({ message: err.message })
        }
    },

    getUsersAllInfor: async (req, res) => {
        try {
            const users = await Users.find().select('-password')
            res.json(users)
        } catch (err) {
            return res.status(500).json({ message: err.message })
        }
    },

    getUsersAllSubscribersInfor: async (req, res) => {
        try {
            const users = await Users.find({
                $and: [
                    { role: { $ne: "admin" } },
                    { _id: { $ne: req.user.id } }
                ]
            }
            ).select('-password')
            res.json(users)
        } catch (err) {
            return res.status(500).json({ message: err.message })
        }
    },

    logout: async (req, res) => {
        try {
            res.clearCookie('refreshtoken', { path: '/user/refresh_token' })
            return res.json({ message: "You have successfully logged out." })
        } catch (err) {
            return res.status(500).json({ message: err.message })
        }
    },

    updateUser: async (req, res) => {
        try {
            const { name, avatar } = req.body
            const user = await Users.findOneAndUpdate(
                { _id: req.user.id },
                { name, avatar },
                { returnOriginal: false }
            )
            res.json({ user, message: "Update Success!" })
        } catch (err) {
            return res.status(500).json({ message: err.message })
        }
    },

    updateUsersRole: async (req, res) => {
        try {
            const { role } = req.body
            const subscribers = await Users.findOneAndUpdate(
                { _id: req.params.id },
                { $set: { role } },
                { returnOriginal: false }
            )
            res.json({ subscribers, message: "Update Success!" })
        } catch (err) {
            return res.status(500).json({ message: err.message })
        }
    },

    deleteUser: async (req, res) => {
        try {
            await Users.findByIdAndDelete(req.params.id)

            res.json({ id: req.params.id, message: "Deleted Success!" })
        } catch (err) {
            return res.status(500).json({ message: err.message })
        }
    },

    googleLogin: async (req, res) => {
        try {
            const { tokenId } = req.body
            const verify = await client.verifyIdToken({ idToken: tokenId, audience: process.env.MAILING_SERVICE_CLIENT_ID })
            const { email_verified, email, name, picture } = verify.payload
            const password = email + process.env.GOOGLE_SECRET
            const passwordHash = await bcrypt.hash(password, 12)
            if (!email_verified) return res.status(400).json({ message: "Email verification failed." })
            const user = await Users.findOne({ email })

            if (user) {
                const isMatch = await bcrypt.compare(password, user.password)
                if (!isMatch) return res.status(400).json({ message: "Password is incorrect." })

                const refresh_token = createRefreshToken({ id: user._id })
                res.cookie('refreshtoken', refresh_token, {
                    httpOnly: true,
                    path: '/user/refresh_token',
                    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
                })

                res.json({ message: "Login success!" })
            } else {
                const newUser = new Users({
                    name, email, password: passwordHash, avatar: picture
                })

                await newUser.save()

                const refresh_token = createRefreshToken({ id: newUser._id })
                res.cookie('refreshtoken', refresh_token, {
                    httpOnly: true,
                    path: '/user/refresh_token',
                    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
                })

                res.json({ message: "Login success!" })
            }


        } catch (err) {
            return res.status(500).json({ message: err.message })
        }
    },

    facebookLogin: async (req, res) => {
        try {
            const { accessToken, userID } = req.body
            const URL = `https://graph.facebook.com/v2.9/${userID}/?fields=id,name,email,picture&access_token=${accessToken}`
            const data = await fetch(URL).then(res => res.json()).then(res => { return res })
            const { email, name, picture } = data
            const password = email + process.env.FACEBOOK_SECRET
            const passwordHash = await bcrypt.hash(password, 12)
            const user = await Users.findOne({ email })

            if (user) {
                const isMatch = await bcrypt.compare(password, user.password)
                if (!isMatch) return res.status(400).json({ message: "Password is incorrect." })

                const refresh_token = createRefreshToken({ id: user._id })
                res.cookie('refreshtoken', refresh_token, {
                    httpOnly: true,
                    path: '/user/refresh_token',
                    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
                })

                res.json({ message: "Login success!" })
            } else {
                const newUser = new Users({
                    name, email, password: passwordHash, avatar: picture.data.url
                })

                await newUser.save()

                const refresh_token = createRefreshToken({ id: newUser._id })
                res.cookie('refreshtoken', refresh_token, {
                    httpOnly: true,
                    path: '/user/refresh_token',
                    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
                })
                res.json({ message: "Login success!" })
            }

        } catch (err) {
            return res.status(500).json({ message: err.message })
        }
    }
}





function validateEmail(email) {
    const re = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(email);
}

function validatePassword(password) {
    const re = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[=+!@#\\$%\\^&\\*\\._\\-\\\\/()])(.{8,})$/;
    return re.test(password);
}

const createActivationToken = (payload) => {
    return jwt.sign(payload, process.env.ACTIVATION_TOKEN_SECRET, { expiresIn: '5m' })
}

const createAccessToken = (payload) => {
    return jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '15m' })
}

const createRefreshToken = (payload) => {
    return jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET, { expiresIn: '7d' })
}

module.exports = userCtrl