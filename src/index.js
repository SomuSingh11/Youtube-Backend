import connectDB from "./db/index.js";
import { app } from "./app.js";

// Connect to DB
// async function returns a Promise, resolved using then-catch
connectDB()
  .then(() => {
    app.on("error", (error) => {
      console.log("Express App Error ", error);
    });
    app.listen(process.env.PORT || 8000, () => {
      console.log(`Server is running at PORT: ${process.env.PORT}`);
    });
  })
  .catch((err) => {
    console.log(`MongoDB Connect failed !!`, err);
  });
