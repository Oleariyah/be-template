const userPermissions = {
	canManageUsers: (role) => {
		return (
			role === "admin" ||
			role === "sub-admin"
		)
	},

	canUpdateAndDeleteUser: (userRole, selectedUserRole) => {
		return (
			userRole === "admin" ||
			selectedUserRole === "subscriber"
		)
	}
}

module.exports = userPermissions;