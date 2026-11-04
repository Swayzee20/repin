/* eslint-disable @typescript-eslint/no-require-imports -- Metro loads this file as CommonJS. */
const { getSentryExpoConfig } = require("@sentry/react-native/metro");

// Debug ids for source maps. Replay and feedback stay out of the web bundle.
const config = getSentryExpoConfig(__dirname, {
  includeWebFeedback: false,
  includeWebReplay: false,
});

module.exports = config;
