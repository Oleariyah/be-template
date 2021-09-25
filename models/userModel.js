const mongoose = require('mongoose')


const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, "Please enter your name!"],
        trim: true
    },
    email: {
        type: String,
        required: [true, "Please enter your email!"],
        trim: true,
        unique: true
    },
    password: {
        type: String,
        required: [true, "Please enter your password!"]
    },
    role: {
        type: String,
        default: 'subscriber'
    },
    avatar: {
        type: String,
        default: "https://res.cloudinary.com/dzmaiebsp/image/upload/v1612718849/default_ny1fpf.png"
    }
}, {
    timestamps: true
})

module.exports = mongoose.model("Users", userSchema)