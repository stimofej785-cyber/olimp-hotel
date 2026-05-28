const { readAuthToken, getSession } = require("./adminAuth");

function optionalAuth(req, res, next) {
  const token = readAuthToken(req);

  if (!token) {
    return next();
  }

  getSession(token)
    .then(function (session) {
      if (session) {
        req.authToken = token;
        req.authUser = session;
      }
      next();
    })
    .catch(next);
}

module.exports = { optionalAuth };
