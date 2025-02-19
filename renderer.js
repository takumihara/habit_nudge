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

// Detect faces and calculate head tilt
async function detectFaces() {
  if (!detector || !currentStream || !isDetecting) return;

  try {
    const faces = await detector.estimateFaces(videoElement);

    if (faces.length > 0) {
      const face = faces[0];
      const tiltAngle = calculateHeadTilt(face.keypoints);

      // Update tilt information
      let tiltDirection = "Level";
      if (tiltAngle < -5) tiltDirection = "Tilted Left";
      if (tiltAngle > 5) tiltDirection = "Tilted Right";

      tiltInfo.innerText = `Head Tilt: ${tiltDirection} (${tiltAngle.toFixed(
        1,
      )}°)`;

      // Visualize face landmarks on canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

      // Draw facial landmarks
      ctx.fillStyle = "#00FF00";
      face.keypoints.forEach((point) => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 2, 0, 2 * Math.PI);
        ctx.fill();
      });
    } else {
      tiltInfo.innerText = "No face detected";
    }
  } catch (error) {
    console.error("Error in face detection:", error);
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
