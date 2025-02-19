const information = document.getElementById("info");
const videoElement = document.getElementById("video");
const startButton = document.getElementById("start-camera");
const stopButton = document.getElementById("stop-camera");
const tiltInfo = document.getElementById("tilt-info");
const canvas = document.getElementById("output");
const ctx = canvas.getContext("2d");

let currentStream = null;
let detector = null;
let isDetecting = false;

const MOUTH_OPEN_THRESHOLD = 0.01;

// Load the face landmarks detection model
async function loadModel() {
  try {
    information.innerText = "Loading face detection model...";
    detector = await faceLandmarksDetection.createDetector(
      faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
      {
        runtime: "tfjs",
        refineLandmarks: true,
        maxFaces: 1,
        shouldLoadIrisModel: false,
      },
    );
    information.innerText = "Face detection model loaded successfully";
  } catch (error) {
    console.error("Error loading face detection model:", error);
    information.innerText = `Error loading face detection model: ${error.message}`;
  }
}

// Calculate head tilt angle from facial landmarks
function calculateHeadTilt(keypoints) {
  // Get the eye positions (using more stable points)
  const leftEye = keypoints[159]; // Left eye outer corner
  const rightEye = keypoints[386]; // Right eye outer corner

  // Calculate angle
  const deltaY = rightEye.y - leftEye.y;
  const deltaX = rightEye.x - leftEye.x;
  const angleRad = Math.atan2(deltaY, deltaX);
  const angleDeg = angleRad * (180 / Math.PI);

  return angleDeg;
}

// Calculate if mouth is open using lip landmarks
function isMouthOpen(keypoints) {
  // Upper lip points (center)
  const upperLip = keypoints[13]; // Upper lip top
  const lowerLip = keypoints[14]; // Lower lip bottom

  // Calculate vertical distance between lips
  const lipDistance = Math.abs(upperLip.y - lowerLip.y);

  // Get face height (using nose bridge to chin as reference)
  const noseBridge = keypoints[168]; // Nose bridge
  const chin = keypoints[152]; // Chin
  const faceHeight = Math.abs(chin.y - noseBridge.y);

  // Calculate ratio of lip distance to face height
  const mouthOpenRatio = lipDistance / faceHeight;

  // Return both the boolean and the ratio for visualization
  return {
    isOpen: mouthOpenRatio > MOUTH_OPEN_THRESHOLD, // Adjust this threshold as needed
    ratio: mouthOpenRatio,
  };
}

// Detect faces and calculate head tilt
async function detectFaces() {
  if (!detector || !currentStream || !isDetecting) return;

  try {
    const faces = await detector.estimateFaces(videoElement);

    if (faces.length > 0) {
      const face = faces[0];
      const tiltAngle = calculateHeadTilt(face.keypoints);
      const mouthState = isMouthOpen(face.keypoints);

      // Update tilt and mouth information
      let tiltDirection = "Level";
      if (tiltAngle < -5) tiltDirection = "Tilted Left";
      if (tiltAngle > 5) tiltDirection = "Tilted Right";

      const mouthStatus = mouthState.isOpen ? "Open" : "Closed";
      tiltInfo.innerText = `Head Tilt: ${tiltDirection} (${tiltAngle.toFixed(
        1,
      )}°) | Mouth: ${mouthStatus}`;

      // Clear previous drawing
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Make canvas transparent
      ctx.globalAlpha = 0.6;

      // Draw facial landmarks with connecting lines
      ctx.strokeStyle = "#00FF00";
      ctx.lineWidth = 2;

      // Draw eyes
      const leftEye = face.keypoints[159];
      const rightEye = face.keypoints[386];

      // Draw line between eyes to show tilt
      ctx.beginPath();
      ctx.moveTo(leftEye.x, leftEye.y);
      ctx.lineTo(rightEye.x, rightEye.y);
      ctx.stroke();

      // Draw mouth points and lines
      const upperLip = face.keypoints[13];
      const lowerLip = face.keypoints[14];
      const noseBridge = face.keypoints[168];
      const chin = face.keypoints[152];

      // Draw mouth lines
      ctx.strokeStyle = mouthState.isOpen ? "#FF0000" : "#00FF00";
      ctx.beginPath();
      ctx.moveTo(upperLip.x, upperLip.y);
      ctx.lineTo(lowerLip.x, lowerLip.y);
      ctx.stroke();

      // Draw dots for all facial landmarks
      ctx.fillStyle = "#FF0000";
      face.keypoints.forEach((point) => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 2, 0, 2 * Math.PI);
        ctx.fill();
      });

      // Draw special points larger
      ctx.fillStyle = "#00FF00";
      // Eyes
      [leftEye, rightEye].forEach((point) => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 4, 0, 2 * Math.PI);
        ctx.fill();
      });

      // Mouth points
      ctx.fillStyle = mouthState.isOpen ? "#FF0000" : "#00FF00";
      [upperLip, lowerLip].forEach((point) => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 4, 0, 2 * Math.PI);
        ctx.fill();
      });

      // Reset transparency
      ctx.globalAlpha = 1.0;
    } else {
      tiltInfo.innerText = "No face detected";
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  } catch (error) {
    console.error("Error in face detection:", error);
    tiltInfo.innerText = "Error in face detection";
  }

  requestAnimationFrame(detectFaces);
}

// Get available video input devices
async function getVideoDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((device) => device.kind === "videoinput");
  } catch (error) {
    console.error("Error getting video devices:", error);
    information.innerText = `Error getting video devices: ${error.message}`;
    return [];
  }
}

// Update camera labels after getting permissions
async function updateCameraLabels() {
  const cameraSelector = document.getElementById("camera-selector");
  const cameraDevices = await getVideoDevices();

  Array.from(cameraSelector.options).forEach((option, index) => {
    const device = cameraDevices[index];
    if (option.text.startsWith("Camera") && device && device.label) {
      option.text = device.label;
    }
  });
}

// Create and append camera selector
async function createCameraSelector() {
  const cameraDevices = await getVideoDevices();

  const selector = document.createElement("select");
  selector.id = "camera-selector";
  selector.style.margin = "10px 0";

  if (cameraDevices.length === 0) {
    const option = document.createElement("option");
    option.text = "No cameras found";
    selector.appendChild(option);
    startButton.disabled = true;
    stopButton.disabled = true;
    information.innerText = "No cameras available";
  } else {
    cameraDevices.forEach((device, index) => {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.text = device.label || `Camera ${index + 1}`;
      selector.appendChild(option);
    });
  }

  // Insert selector before the camera controls div
  const cameraControls = document.querySelector(".camera-controls");
  cameraControls.parentNode.insertBefore(selector, cameraControls);
  return selector;
}

// Start camera with selected device
async function startCamera() {
  try {
    const cameraSelector = document.getElementById("camera-selector");
    const deviceId = cameraSelector.value;

    const constraints = {
      video: deviceId ? { deviceId: { exact: deviceId } } : true,
    };

    currentStream = await navigator.mediaDevices.getUserMedia(constraints);
    videoElement.srcObject = currentStream;

    // Update button states
    startButton.disabled = true;
    stopButton.disabled = false;
    cameraSelector.disabled = true;

    // After getting camera permissions, update labels if they were empty
    await updateCameraLabels();

    // Start face detection
    isDetecting = true;
    detectFaces();
  } catch (error) {
    console.error("Error accessing camera:", error);
    information.innerText = `Error accessing camera: ${error.message}`;
  }
}

// Stop camera stream
function stopCamera() {
  isDetecting = false;
  if (currentStream) {
    currentStream.getTracks().forEach((track) => track.stop());
    currentStream = null;
    videoElement.srcObject = null;
    tiltInfo.innerText = "";
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Update button states
    startButton.disabled = false;
    stopButton.disabled = true;
    const cameraSelector = document.getElementById("camera-selector");
    cameraSelector.disabled = false;
  }
}

// Initialize
async function initialize() {
  await loadModel();
  await createCameraSelector();
}

// Create camera selector when page loads
initialize();

// Add click event listeners to buttons
startButton.addEventListener("click", startCamera);
stopButton.addEventListener("click", stopCamera);
