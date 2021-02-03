require("dotenv").config();

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const serviceAccount = require(
    "./credential/magic-link-tutorial-firebase-adminsdk-up9ey-44a904b3c4.json"
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://fir-demo-integration.firebaseio.com",
});

const handleExistingUser = async (user, claim) => {
  /* Check for replay attack (https://go.magic.link/replay-attack) */
  const lastSignInTime = Date.parse(user.metadata.lastSignInTime) / 1000;
  const tokenIssuedTime = claim.iat;
  if (tokenIssuedTime <= lastSignInTime) {
    throw new functions.https.HttpsError(
        "invalid-argument",
        "This DID token is invalid."
    );
  }
  const firebaseToken = await admin.auth().createCustomToken(user.uid);
  return {
    uid: user.uid,
    token: firebaseToken,
  };
};

const handleNewUser = async (email) => {
  const newUser = await admin.auth().createUser({
    email: email,
    emailVerified: true,
  });
  const firebaseToken = await admin.auth().createCustomToken(newUser.uid);
  return {
    uid: newUser.uid,
    token: firebaseToken,
  };
};

exports.auth = functions.https.onCall(async (data, context) => {
  const {Magic} = require("@magic-sdk/admin");
  const magic = new Magic(process.env.MAGIC_SECRET_API_KEY);
  const didToken = data.didToken;
  const metadata = await magic.users.getMetadataByToken(didToken);
  const email = metadata.email;
  try {
    /* Get existing user by email address,
       compatible with legacy Firebase email users */
    const user = (await admin.auth().getUserByEmail(email)).toJSON();
    const claim = magic.token.decode(didToken)[1];
    return await handleExistingUser(user, claim);
  } catch (err) {
    if (err.code === "auth/user-not-found") {
      /* Create new user */
      return await handleNewUser(email);
    } else {
      throw err;
    }
  }
});
