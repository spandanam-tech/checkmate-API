class ApiError extends Error {
  constructor(statusCode, message = "Something went wrong", error = null) {
    super(message);
    this.success = false;
    this.statusCode = statusCode;
    this.error = error;
  }

  toJSON() {
    return {
      success: false,
      statusCode: this.statusCode,
      message: this.message,
      error: this.error,
    };
  }
}

export default ApiError;
