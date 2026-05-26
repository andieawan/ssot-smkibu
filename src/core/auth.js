'use strict';

/**
 * Middleware: Require user to be logged in
 */
function requireLogin(req, res, next) {
  if (!req.session || !req.session.user) {
    req.flash('error', 'Silakan login terlebih dahulu.');
    return res.redirect('/login');
  }
  next();
}

/**
 * Middleware: Require specific role(s)
 * @param {...string} roles - Allowed roles
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      req.flash('error', 'Silakan login terlebih dahulu.');
      return res.redirect('/login');
    }
    const userRole = req.session.user.role;
    if (!roles.includes(userRole)) {
      req.flash('error', 'Anda tidak memiliki akses ke halaman ini.');
      return res.redirect('/dashboard');
    }
    next();
  };
}

/**
 * Middleware: Attach user to res.locals for views
 */
function attachUser(req, res, next) {
  res.locals.user = req.session.user || null;
  res.locals.flash_success = req.flash('success');
  res.locals.flash_error = req.flash('error');
  res.locals.flash_info = req.flash('info');
  next();
}

/**
 * Check if user can edit an incident (within 30 minutes or admin/super_admin/bk)
 */
function canEditIncident(user, incidentCreatedAt) {
  const adminRoles = ['super_admin', 'admin', 'bk'];
  if (adminRoles.includes(user.role)) return true;
  const now = new Date();
  const created = new Date(incidentCreatedAt);
  const diffMinutes = (now - created) / (1000 * 60);
  return diffMinutes <= 30;
}

module.exports = { requireLogin, requireRole, attachUser, canEditIncident };
