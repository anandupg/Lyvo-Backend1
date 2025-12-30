const jwt = require('jsonwebtoken');
const User = require('../user/model');

/**
 * JWT Authentication Middleware
 * Verifies JWT tokens and attaches user information to request
 */
const authMiddleware = async (req, res, next) => {
    try {
        // Get token from Authorization header
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Access denied. No token provided or invalid format.',
                error: 'MISSING_TOKEN'
            });
        }

        // Extract token from "Bearer <token>"
        const token = authHeader.substring(7);

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Access denied. Token is required.',
                error: 'EMPTY_TOKEN'
            });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Attach user information to request
        // Map both standard and chat-service style payload
        // DEBUG: Log decoded token to investigate missing role
        // console.log('Auth Middleware Decoded Token:', JSON.stringify(decoded, null, 2));

        req.user = {
            id: decoded.id || decoded.userId || decoded._id,
            email: decoded.email,
            role: decoded.role,
            name: decoded.name
        };

        // Robustness: If role is missing in token (legacy/buggy tokens), fetch from DB
        if (req.user.role === undefined) {
            console.warn('WARNING: Role missing in token for user:', req.user.email || req.user.id, '- Fetching from DB...');
            try {
                const user = await User.findById(req.user.id).select('role email name');
                if (user) {
                    req.user.role = user.role;
                    req.user.email = req.user.email || user.email;
                    req.user.name = req.user.name || user.name;
                    console.log('Successfully recovered user role from DB:', req.user.role);
                } else {
                    console.error('User not found in DB during token recovery');
                }
            } catch (dbError) {
                console.error('Database error during token recovery:', dbError.message);
            }
        }

        next();
    } catch (error) {
        console.error('JWT Authentication Error:', error.message);

        let errorMessage = 'Access denied. Invalid token.';
        let errorCode = 'INVALID_TOKEN';

        if (error.name === 'TokenExpiredError') {
            errorMessage = 'Access denied. Token has expired.';
            errorCode = 'TOKEN_EXPIRED';
        } else if (error.name === 'JsonWebTokenError') {
            errorMessage = 'Access denied. Invalid token format.';
            errorCode = 'MALFORMED_TOKEN';
        }

        return res.status(401).json({
            success: false,
            message: errorMessage,
            error: errorCode
        });
    }
};

/**
 * Internal API Key Middleware
 * Protects internal endpoints (like chat initiation from booking service)
 */
const internalApiKeyMiddleware = (req, res, next) => {
    try {
        const apiKey = req.headers['x-api-key'] || req.headers['x-internal-key'];

        if (!apiKey) {
            return res.status(401).json({
                success: false,
                message: 'Access denied. Internal API key required.',
                error: 'MISSING_API_KEY'
            });
        }

        if (apiKey !== process.env.INTERNAL_API_KEY) {
            return res.status(401).json({
                success: false,
                message: 'Access denied. Invalid API key.',
                error: 'INVALID_API_KEY'
            });
        }

        next();
    } catch (error) {
        console.error('Internal API Key Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Internal server error during API key validation.',
            error: 'API_KEY_VALIDATION_ERROR'
        });
    }
};

/**
 * Optional Authentication Middleware
 * Tries to authenticate but doesn't fail if token is missing
 * Useful for endpoints that work with or without authentication
 */
const optionalAuthMiddleware = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            // No token provided, continue without user info
            req.user = null;
            return next();
        }

        const token = authHeader.substring(7);

        if (!token) {
            req.user = null;
            return next();
        }

        // Try to verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        req.user = {
            id: decoded.id || decoded.userId || decoded._id,
            email: decoded.email,
            role: decoded.role,
            name: decoded.name
        };

        next();
    } catch (error) {
        // Token is invalid, but we don't fail the request
        console.warn('Optional JWT Authentication Warning:', error.message);
        req.user = null;
        next();
    }
};

/**
 * Role-based Authorization Middleware
 * Checks if user has required role
 */
const requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required.',
                error: 'AUTHENTICATION_REQUIRED'
            });
        }

        const userRole = req.user.role; // Number (1, 2, 3)
        const allowedRoles = Array.isArray(roles) ? roles : [roles];

        // Map string roles to numbers
        const ROLE_MAP = {
            'seeker': 1,
            'admin': 2,
            'owner': 3
        };

        const allowedRoleValues = allowedRoles.map(role => {
            if (typeof role === 'string' && ROLE_MAP[role.toLowerCase()]) {
                return ROLE_MAP[role.toLowerCase()];
            }
            return role;
        });

        console.log(`Auth Check: User Role=${userRole} (${typeof userRole}), Allowed=${JSON.stringify(allowedRoleValues)}`);

        // Check if userRole matches any allowed role (handling both string/number types)
        // using loose equality (==) to handle mixed types (e.g. "2" vs 2)
        const hasPermission = allowedRoleValues.some(role => role == userRole);

        if (!hasPermission) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Insufficient permissions.',
                error: 'INSUFFICIENT_PERMISSIONS',
                required: allowedRoles,
                current: userRole
            });
        }

        next();
    };
};

/**
 * Socket.io JWT Authentication
 * Authenticates WebSocket connections using JWT
 */
const socketAuthMiddleware = (socket, next) => {
    try {
        const token = socket.handshake.auth.token || socket.handshake.query.token;

        if (!token) {
            return next(new Error('Authentication error: No token provided'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        socket.user = {
            id: decoded.id || decoded.userId || decoded._id,
            email: decoded.email,
            role: decoded.role,
            name: decoded.name
        };

        next();
    } catch (error) {
        console.error('Socket JWT Authentication Error:', error.message);
        next(new Error('Authentication error: Invalid token'));
    }
};

module.exports = {
    authMiddleware,
    internalApiKeyMiddleware,
    optionalAuthMiddleware,
    requireRole,
    socketAuthMiddleware
};
