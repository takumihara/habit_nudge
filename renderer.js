const information = document.getElementById("info");
const videoElement = document.getElementById("video");
const startButton = document.getElementById("start-camera");
const stopButton = document.getElementById("stop-camera");
let currentStream = null;

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
  } catch (error) {
    console.error("Error accessing camera:", error);
    information.innerText = `Error accessing camera: ${error.message}`;
  }
}

// Stop camera stream
function stopCamera() {
  if (currentStream) {
    currentStream.getTracks().forEach((track) => track.stop());
    currentStream = null;
    videoElement.srcObject = null;

    // Update button states
    startButton.disabled = false;
    stopButton.disabled = true;
    const cameraSelector = document.getElementById("camera-selector");
    cameraSelector.disabled = false;
  }
}

// Create camera selector when page loads
createCameraSelector();

// Add click event listeners to buttons
startButton.addEventListener("click", startCamera);
stopButton.addEventListener("click", stopCamera);
