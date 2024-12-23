
const express = require("express");
const faceapi = require("face-api.js");
const { Canvas, Image } = require("canvas");
const canvas = require("canvas");
const mysql = require("mysql2/promise");
const fileUpload = require("express-fileupload");
const dotenv = require("dotenv");
const cors = require("cors");

dotenv.config();
faceapi.env.monkeyPatch({ Canvas, Image });

const app = express();

// Enable CORS for all routes
app.use(cors());

app.use(
  fileUpload({
    useTempFiles: true,
  })
);

// Create MySQL connection pool for better management
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'Rahul*2000',
  database: 'faceRecognition',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Load models at the start of the app
async function loadModels() {
  try {
    await faceapi.nets.ssdMobilenetv1.loadFromDisk('./models');
    await faceapi.nets.faceLandmark68Net.loadFromDisk('./models');
    await faceapi.nets.faceRecognitionNet.loadFromDisk('./models');
    console.log("Models loaded successfully.");
  } catch (error) {
    console.error("Error loading models:", error);
  }
}

loadModels();

// **Upload labeled images to DB** (store only the face descriptors)
async function uploadLabeledImages(images) {
  try {
    const descriptions = [];
    for (let i = 0; i < images.length; i++) {
      const img = await canvas.loadImage(images[i]);
      const detections = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();

      if (detections) {
        console.log(`Face detected for image ${i + 1}`);
        descriptions.push(Array.from(detections.descriptor));
      } else {
        console.log(`No face detected in image ${i + 1}`);
      }
    }

    if (descriptions.length === 0) {
      console.log("No valid faces detected. Aborting DB insert.");
      return false;
    }

    const query = 'INSERT INTO faces (descriptions) VALUES (?)';
    const [result] = await pool.query(query, [JSON.stringify(descriptions)]); // Use query with pool
    console.log("Descriptors saved to DB:", descriptions);

    return true;
  } catch (error) {
    console.error("Error uploading labeled images:", error);
    return false;
  }
}

// **Route for posting face data**
app.post("/postFace", async (req, res) => {
  try {
    const File1 = req.files.File1.tempFilePath;

    if (!File1) {
      return res.status(400).json({ message: "Please provide an image file." });
    }

    const result = await uploadLabeledImages([File1]);
    res.json(result === true 
      ? { message: "Face data stored successfully", status: "Success", faceFlag: "true" } 
      : { message: "This is not a human face.", status: "Failed", faceFlag: "false" });
  } catch (error) {
    console.error("Error in /postFace route:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// **Get descriptors from DB and match with uploaded image**
async function getDescriptorsFromDB(imagePath) {
  try {
    const img = await canvas.loadImage(imagePath);
    const detections = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();

    if (!detections) {
      console.log("No face detected in the uploaded image.");
      return "No face detected";
    }

    const descriptor = detections.descriptor; // Descriptor for the uploaded image
    console.log("Descriptor from uploaded image:", descriptor);

    const [rows] = await pool.query('SELECT descriptions FROM faces');

    if (Array.isArray(rows) && rows.length > 0) {
      const faceData = [];

      rows.forEach((row) => {
        try {
          const descriptions = JSON.parse(row.descriptions); // Parse the JSON descriptions

          if (Array.isArray(descriptions)) {
            descriptions.forEach((desc) => {
              faceData.push(new Float32Array(desc));
            });
          }
        } catch (error) {
          console.error("Error parsing descriptions:", row.descriptions);
        }
      });

      if (faceData.length === 0) {
        return "No valid faces found in the database.";
      }

      const faceMatcher = new faceapi.FaceMatcher(faceData, 0.4);
      const bestMatch = faceMatcher.findBestMatch(descriptor);

      console.log("Best match result:", bestMatch.toString());
      return bestMatch.toString();
    } else {
      return "No faces found in the database.";
    }
  } catch (error) {
    console.error("Error retrieving descriptors from DB:", error);
    return "Error occurred";
  }
}

// **Route for checking face match**
// app.post("/checkFace", async (req, res) => {
//   try {
//     const File1 = req.files.File1.tempFilePath;

//     if (!File1) {
//       return res.status(400).json({ message: "Please provide a file for face detection." });
//     }

//     const result = await getDescriptorsFromDB(File1);
//     res.json({ result });
//   } catch (error) {
//     console.error("Error in /checkFace route:", error);
//     res.status(500).json({ message: "Internal server error" });
//   }
// });

// app.post("/checkFace", async (req, res) => {
//   try {
//     const File1 = req.files.File1.tempFilePath;

//     if (!File1) {
//       return res.status(400).json({
//         message: "Please provide a file for face detection.",
//         status: "failed",
//         faceMatch: ""
//       });
//     }

//     const result = await getDescriptorsFromDB(File1);

//     if (result === "No face detected" || result === "No valid faces found in the database." || result === "Error occurred") {
//       return res.json({
//         message: "Face did not match successfully.",
//         status: "failed",
//         faceMatch: result
//       });
//     }

//     // If a match is found, return the face match result
//     return res.json({
//       message: "Face matched successfully.",
//       status: "Success",
//       faceMatch: result
//     });
//   } catch (error) {
//     console.error("Error in /checkFace route:", error);
//     res.status(500).json({
//       message: "Internal server error",
//       status: "failed",
//       faceMatch: ""
//     });
//   }
// });


// app.post("/checkFace", async (req, res) => {
//   try {
//     const File1 = req.files.File1.tempFilePath;

//     if (!File1) {
//       return res.status(400).json({
//         message: "Please provide a file for face detection.",
//         status: "failed",
//         faceMatch: ""
//       });
//     }

//     const result = await getDescriptorsFromDB(File1);

//     // If no face was detected or an error occurred
//     if (result === "No face detected" || result === "No valid faces found in the database." || result === "Error occurred") {
//       return res.json({
//         message: "Face did not match successfully.",
//         status: "failed",
//         faceMatch: result
//       });
//     }

//     // Check if the result contains a match and confidence score
//     if (result.includes("unknown") || result.includes("unknown") && parseFloat(result.split('(')[1].split(')')[0]) < 0.4) {
//       return res.json({
//         message: "Face did not match successfully.",
//         status: "failed",
//         faceMatch: result
//       });
//     }

//     // If a match is found and the confidence is above the threshold
//     return res.json({
//       message: "Face matched successfully.",
//       status: "success",
//       faceMatch: result
//     });
//   } catch (error) {
//     console.error("Error in /checkFace route:", error);
//     res.status(500).json({
//       message: "Internal server error",
//       status: "failed",
//       faceMatch: ""
//     });
//   }
// });


app.post("/checkFace", async (req, res) => {
  try {
    const File1 = req.files.File1.tempFilePath;

    if (!File1) {
      return res.status(400).json({
        message: "Please provide a file for face detection.",
        status: "failed",
        faceMatch: ""
      });
    }

    const result = await getDescriptorsFromDB(File1);

    // If no face was detected or an error occurred
    if (result === "No face detected" || result === "No valid faces found in the database." || result === "Error occurred") {
      return res.json({
        message: "Face did not match successfully.",
        status: "failed",
        faceMatch: result
      });
    }

    // Check if the result contains a match and confidence score
    if (result.includes("unknown") || result.includes("unknown") && parseFloat(result.split('(')[1].split(')')[0]) < 0.4) {
      return res.json({
        message: "Face did not match successfully.",
        status: "failed",
        faceMatch: result
      });
    }

    // If a match is found and the confidence is above the threshold
    return res.json({
      message: "Face matched successfully.",
      status: "success",
      faceMatch: result
    });
  } catch (error) {
    console.error("Error in /checkFace route:", error);
    res.status(500).json({
      message: "Internal server error",
      status: "failed",
      faceMatch: ""
    });
  }
});

const PORT = 3028;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}.`));
