const userPermissions = {
	canManageUsers: (role) => (
		role !== "admin" || role !== "sub-admin"
	)
}

module.exports = userPermissions;