const morgan = require("morgan");

// ANSI Color codes for clean terminal logging
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
};

/**
 * Format HTTP status codes with appropriate colors
 */
function colorStatus(status) {
  if (!status) return `${colors.red}???${colors.reset}`;
  if (status >= 500) return `${colors.red}${colors.bright}${status}${colors.reset}`;
  if (status >= 400) return `${colors.yellow}${colors.bright}${status}${colors.reset}`;
  if (status >= 300) return `${colors.cyan}${status}${colors.reset}`;
  if (status >= 200) return `${colors.green}${colors.bright}${status}${colors.reset}`;
  return `${colors.white}${status}${colors.reset}`;
}

/**
 * Format HTTP method with appropriate colors
 */
function colorMethod(method) {
  if (!method) return "      ";
  switch (method.toUpperCase()) {
    case "GET":
      return `${colors.green}${colors.bright}GET   ${colors.reset}`;
    case "POST":
      return `${colors.yellow}${colors.bright}POST  ${colors.reset}`;
    case "PUT":
      return `${colors.blue}${colors.bright}PUT   ${colors.reset}`;
    case "PATCH":
      return `${colors.magenta}${colors.bright}PATCH ${colors.reset}`;
    case "DELETE":
      return `${colors.red}${colors.bright}DELETE${colors.reset}`;
    default:
      return `${colors.white}${colors.bright}${method.padEnd(6)}${colors.reset}`;
  }
}

// Custom morgan token for current timestamp
morgan.token("time", () => {
  const now = new Date();
  return `${colors.gray}[${now.toLocaleTimeString("en-GB")}]${colors.reset}`;
});

// Custom morgan token for colored method
morgan.token("colored-method", (req) => {
  return colorMethod(req.method);
});

// Custom morgan token for colored status
morgan.token("colored-status", (req, res) => {
  return colorStatus(res.statusCode);
});

// Custom morgan token for response time formatting
morgan.token("response-time-ms", (req, res, digits) => {
  if (!req._startAt || !res._startAt) return "0ms";
  const ms = (res._startAt[0] - req._startAt[0]) * 1e3 + (res._startAt[1] - req._startAt[1]) * 1e-6;
  const formatted = ms.toFixed(digits || 0);
  if (ms > 1000) return `${colors.yellow}${formatted}ms${colors.reset}`;
  return `${colors.gray}${formatted}ms${colors.reset}`;
});

// Custom HTTP request logger middleware
const requestLogger = morgan((tokens, req, res) => {
  const time = tokens.time(req, res);
  const method = tokens["colored-method"](req, res);
  const url = tokens.url(req, res);
  const status = tokens["colored-status"](req, res);
  const responseTime = tokens["response-time-ms"](req, res, 0);

  return `${time} ${method} ${url} ${status} - ${responseTime}`;
});

module.exports = requestLogger;
