const Users = require('../models/userModel');
const userPermissions = require('../permissions/user');

const authAdmin = async (req, res, next) => {
    try {
        const user = await Users.findOne({ _id: req.user.id })
        if (userPermissions.canManageUsers(user.role))
            return res.status(500).json({ message: "Admin resources access denied." })

        next()
    } catch (err) {
        return res.status(500).json({ message: err.message })
    }
}

module.exports = authAdmin