// The asyncHandler utility function is designed to handle asynchronous route handlers in an Express application.

const asyncHandler = (requestHandler) => {
  return (req, res, next) => {
    Promise.resolve(requestHandler(req, res, next)) // Wrap the request handler in a Promise and resolve it
      .catch((err) => next(err)); // Catch and pass the error to the next middleware
  };
};

export { asyncHandler };

// Another method to implement asyncHandler Utility using try-catch
/*
const asyncHandler = (func) => async (req, res, next) => {
  try {
    await func(req, res, next);
  } catch (error) {
    res.status(error.code || 500).json({
      success: false,
      message: error.message,
    });
  }
};
*/
