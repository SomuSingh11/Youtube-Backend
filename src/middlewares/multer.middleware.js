import multer from "multer";

const multerStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    // destination is used to specify the path of the directory in which the files have to be stored
    return cb(null, "./public/temp");
  },
  filename: function (req, file, cb) {
    // It is the filename that is given to the saved file
    return cb(null, `${Date.now()}-${file.originalname}`);
  },
});

// Use diskstorage option in multer
export const upload = multer({ storage: multerStorage });
