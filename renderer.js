const information = document.getElementById("info");
const videoElement = document.getElementById("video");
const startButton = document.getElementById("start-camera");
const stopButton = document.getElementById("stop-camera");
const tiltInfo = document.getElementById("tilt-info");
const canvas = document.getElementById("output");
const ctx = canvas.getContext("2d");
const tiltDetectionToggle = document.getElementById("tilt-detection");
const mouthDetectionToggle = document.getElementById("mouth-detection");

let currentStream = null;
let detector = null;
let isDetecting = false;

// Detection state
let isTiltDetectionEnabled = true;
let isMouthDetectionEnabled = true;

const MOUTH_OPEN_THRESHOLD = 0.01;
const CONSECUTIVE_FRAMES_THRESHOLD = 5; // Number of consecutive frames needed to trigger alert

// State tracking for consecutive frames
let consecutiveLeftTiltFrames = 0;
let consecutiveRightTiltFrames = 0;
let consecutiveMouthOpenFrames = 0;
let lastTiltDirection = "Level";
let lastMouthState = false;

// Create audio context and sounds
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

// Function to create a beep sound
function createBeep(frequency, duration, type = "sine") {
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.type = type;
  oscillator.frequency.value = frequency;

  gainNode.gain.value = 0.1; // Lower volume

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.start();

  // Fade out to avoid clicks
  gainNode.gain.exponentialRampToValueAtTime(
    0.001,
    audioContext.currentTime + duration,
  );
  oscillator.stop(audioContext.currentTime + duration);
}

// Function to play different sounds for different events
function playEventSound(event) {
  switch (event) {
    case "tiltLeft":
      if (isTiltDetectionEnabled) createBeep(330, 0.1); // Lower frequency
      break;
    case "tiltRight":
      if (isTiltDetectionEnabled) createBeep(440, 0.1); // Higher frequency
      break;
    case "mouthOpen":
      if (isMouthDetectionEnabled) createBeep(600, 0.05, "square"); // Different sound for mouth
      break;
  }
}

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

/**
 * （修正）Yaw, Pitch, Roll を計算する関数を新規実装
 *  - keypoints: detector.estimateFaces() で得られる landmarks 配列
 */
function calculateHeadPose(keypoints) {
  // MediaPipe FaceMesh のインデックス例
  const NOSE_BRIDGE = 168; // 鼻筋あたり
  const NOSE_TIP = 4; // 鼻先
  const LEFT_EYE = 159; // 左目の外端
  const RIGHT_EYE = 386; // 右目の外端

  const noseBridge = keypoints[NOSE_BRIDGE];
  const noseTip = keypoints[NOSE_TIP];
  const leftEye = keypoints[LEFT_EYE];
  const rightEye = keypoints[RIGHT_EYE];

  // --- Yaw計算 (left-right) ---
  // ここでは左右目のベクトル差から推定
  const eyeVector = {
    x: rightEye.x - leftEye.x,
    y: rightEye.y - leftEye.y,
    z: rightEye.z - leftEye.z,
  };
  // XZ平面に投影してatan2(Z, X)
  const yaw = Math.atan2(eyeVector.z, eyeVector.x) * (180 / Math.PI);

  // --- Pitch計算 (up-down) ---
  // 鼻筋～鼻先のベクトル
  const noseVector = {
    x: noseTip.x - noseBridge.x,
    y: noseTip.y - noseBridge.y,
    z: noseTip.z - noseBridge.z,
  };
  // YZ平面に投影して計算
  // （MediaPipe座標ではzが奥向きに負になるため符号調整を行う場合あり）
  const pitch = Math.atan2(-noseVector.y, -noseVector.z) * (180 / Math.PI);

  // --- Roll計算 (頭の傾き) ---
  // 目のラインのy成分 vs (x,z)成分で計算
  const roll =
    Math.atan2(
      eyeVector.y,
      Math.sqrt(eyeVector.x * eyeVector.x + eyeVector.z * eyeVector.z),
    ) *
    (180 / Math.PI);

  return { yaw, pitch, roll };
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
    isOpen: mouthOpenRatio > MOUTH_OPEN_THRESHOLD,
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
      // （修正）Yaw, Pitch, Roll を取得
      const { yaw, pitch, roll } = calculateHeadPose(face.keypoints);

      // Mouth open check
      const mouthState = isMouthOpen(face.keypoints);

      // Update tilt and mouth information
      let tiltDirection = "Level";
      // 例: rollがマイナスなら左に傾いている、プラスなら右に傾いている
      if (roll < -5) tiltDirection = "Tilted Left";
      if (roll > 5) tiltDirection = "Tilted Right";

      // Track consecutive frames for tilt
      if (tiltDirection === "Tilted Left") {
        consecutiveLeftTiltFrames++;
        consecutiveRightTiltFrames = 0;
      } else if (tiltDirection === "Tilted Right") {
        consecutiveRightTiltFrames++;
        consecutiveLeftTiltFrames = 0;
      } else {
        consecutiveLeftTiltFrames = 0;
        consecutiveRightTiltFrames = 0;
      }

      if (mouthState.isOpen) {
        consecutiveMouthOpenFrames++;
      } else {
        consecutiveMouthOpenFrames = 0;
      }

      // Play sounds for tilt / mouth open
      if (isTiltDetectionEnabled) {
        if (
          tiltDirection === "Tilted Left" &&
          consecutiveLeftTiltFrames >= CONSECUTIVE_FRAMES_THRESHOLD &&
          consecutiveLeftTiltFrames % 5 === 0
        ) {
          playEventSound("tiltLeft");
        } else if (
          tiltDirection === "Tilted Right" &&
          consecutiveRightTiltFrames >= CONSECUTIVE_FRAMES_THRESHOLD &&
          consecutiveRightTiltFrames % 5 === 0
        ) {
          playEventSound("tiltRight");
        }
      }

      if (
        isMouthDetectionEnabled &&
        consecutiveMouthOpenFrames >= CONSECUTIVE_FRAMES_THRESHOLD &&
        consecutiveMouthOpenFrames % 5 === 0
      ) {
        playEventSound("mouthOpen");
      }

      // Update info text based on enabled features with alert status
      let infoText = [];
      if (isTiltDetectionEnabled) {
        const leftAlertStatus =
          consecutiveLeftTiltFrames >= CONSECUTIVE_FRAMES_THRESHOLD
            ? '<span class="alert-text">🚨 ALERT!</span>'
            : "";
        const rightAlertStatus =
          consecutiveRightTiltFrames >= CONSECUTIVE_FRAMES_THRESHOLD
            ? '<span class="alert-text">🚨 ALERT!</span>'
            : "";

        infoText.push(
          `Head Tilt (Roll) Detection:\n` +
            `├─ Current State: <span class="status-value">${tiltDirection}</span> (roll: ${roll.toFixed(
              1,
            )}°)\n` +
            `├─ Yaw: <span class="status-value">${yaw.toFixed(
              1,
            )}</span>°, Pitch: <span class="status-value">${pitch.toFixed(
              1,
            )}</span>°\n` +
            `├─ Left Tilt: <span class="status-value">${consecutiveLeftTiltFrames}</span>/<span class="threshold-value">${CONSECUTIVE_FRAMES_THRESHOLD}</span> frames ${leftAlertStatus}\n` +
            `└─ Right Tilt: <span class="status-value">${consecutiveRightTiltFrames}</span>/<span class="threshold-value">${CONSECUTIVE_FRAMES_THRESHOLD}</span> frames ${rightAlertStatus}`,
        );
      }

      if (isMouthDetectionEnabled) {
        const mouthAlertStatus =
          consecutiveMouthOpenFrames >= CONSECUTIVE_FRAMES_THRESHOLD
            ? '<span class="alert-text">🚨 ALERT!</span>'
            : "";

        infoText.push(
          `Mouth Detection:\n` +
            `├─ Current State: <span class="status-value">${
              mouthState.isOpen ? "Open" : "Closed"
            }</span>\n` +
            `├─ Open Ratio: <span class="status-value">${mouthState.ratio.toFixed(
              3,
            )}</span> (Threshold: <span class="threshold-value">${MOUTH_OPEN_THRESHOLD}</span>)\n` +
            `└─ Frames: <span class="status-value">${consecutiveMouthOpenFrames}</span>/<span class="threshold-value">${CONSECUTIVE_FRAMES_THRESHOLD}</span> ${mouthAlertStatus}`,
        );
      }

      tiltInfo.innerHTML = infoText.join("\n\n") || "All detections disabled";

      // Save current states
      lastTiltDirection = tiltDirection;
      lastMouthState = mouthState.isOpen;

      // Clear previous drawing
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Make canvas semi-transparent
      ctx.globalAlpha = 0.6;

      // Draw eyes and tilt line only if tilt detection is enabled
      if (isTiltDetectionEnabled) {
        const leftEye = face.keypoints[159];
        const rightEye = face.keypoints[386];

        ctx.beginPath();
        ctx.moveTo(leftEye.x, leftEye.y);
        ctx.lineTo(rightEye.x, rightEye.y);
        ctx.stroke();

        ctx.fillStyle = "#00FF00";
        [leftEye, rightEye].forEach((point) => {
          ctx.beginPath();
          ctx.arc(point.x, point.y, 4, 0, 2 * Math.PI);
          ctx.fill();
        });
      }

      // Draw mouth
      if (isMouthDetectionEnabled) {
        const upperLip = face.keypoints[13];
        const lowerLip = face.keypoints[14];

        ctx.strokeStyle = mouthState.isOpen ? "#FF0000" : "#00FF00";
        ctx.beginPath();
        ctx.moveTo(upperLip.x, upperLip.y);
        ctx.lineTo(lowerLip.x, lowerLip.y);
        ctx.stroke();

        ctx.fillStyle = mouthState.isOpen ? "#FF0000" : "#00FF00";
        [upperLip, lowerLip].forEach((point) => {
          ctx.beginPath();
          ctx.arc(point.x, point.y, 4, 0, 2 * Math.PI);
          ctx.fill();
        });
      }

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

    // Mirror the video and canvas
    videoElement.style.transform = "scaleX(-1)";
    canvas.style.transform = "scaleX(-1)";

    // Update button states
    startButton.disabled = true;
    stopButton.disabled = false;
    cameraSelector.disabled = true;

    // After getting camera permissions, update labels if they were empty
    await updateCameraLabels();

    // Wait for the video to be loaded before starting face detection
    await new Promise((resolve) => {
      videoElement.onloadeddata = () => {
        resolve();
      };
    });

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

    // Reset mirror effect
    videoElement.style.transform = "";
    canvas.style.transform = "";

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

  // Add event listeners for toggles
  tiltDetectionToggle.addEventListener("change", (e) => {
    isTiltDetectionEnabled = e.target.checked;
  });

  mouthDetectionToggle.addEventListener("change", (e) => {
    isMouthDetectionEnabled = e.target.checked;
  });
}

// Create camera selector when page loads
initialize();

// Add click event listeners to buttons
startButton.addEventListener("click", startCamera);
stopButton.addEventListener("click", stopCamera);
