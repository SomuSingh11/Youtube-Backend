// Response is returned using this class: ApiResponse

class ApiResponse {
  constructor(statusCode, data, message = "Success") {
    this.statusCode = statusCode; // The HTTP status code of the response
    this.data = data; // The data payload of the response
    this.message = message; // A message accompanying the response
    this.success = statusCode < 400; // A boolean indicating success based on the status code
  }
}

export { ApiResponse };
