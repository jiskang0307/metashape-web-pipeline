const express = require('express');
const { spawn } = require('child_process');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');
const os = require('os');

const app = express();
const server = http.createServer(app);

const ALLOWED_ORIGINS = [
  'http://localhost:9000',
  'http://172.17.4.101',
];

const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// CORS 설정
app.use(cors({
  origin: function (origin, callback) {
    // origin이 없거나 (같은 서버) 허용 목록에 있으면 OK
    if (!origin || ALLOWED_ORIGINS.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

const isWindows = os.platform() === 'win32';
const isLinux = os.platform() === 'linux';

app.use(express.json());

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// 실행 파일 경로 설정
const METASHAPE_PATH = isLinux 
  ? '/home/tako/Downloads/metashape-pro/metashape.sh'
  : 'C:\\Program Files\\Agisoft\\Metashape Pro\\metashape.exe';

const POTREE_CONVERTER_PATH = path.join(
  __dirname, 
  isLinux ? 'PotreeConverter' : 'PotreeConverter.exe'
);

// 폴더 설정
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const OUTPUT_DIR = path.join(__dirname, 'outputs');
const POTREE_DIR = path.join(__dirname, 'potree_data');

// 폴더가 없으면 생성
[UPLOAD_DIR, OUTPUT_DIR, POTREE_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Potree 데이터 폴더를 static으로 서빙
app.use('/potree-data', express.static(POTREE_DIR));

// Multer 설정 (기존 코드 유지)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now();
    cb(null, uniqueSuffix + '_' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 500 * 1024 * 1024
  },
  fileFilter: function (req, file, cb) {
    const allowedMimes = ['video/mp4', 'video/avi', 'video/mov', 'video/mkv'];
    if (allowedMimes.includes(file.mimetype) || file.originalname.match(/\.(mp4|avi|mov|mkv)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Only video files are allowed!'));
    }
  }
});

// 상태 확인
app.get('/api/health', (req, res) => {
  const health = {
    status: 'Server is running',
    platform: os.platform(),
    checks: {
      metashapeExists: fs.existsSync(METASHAPE_PATH),
      metashapeExecutable: isLinux ? fs.accessSync(METASHAPE_PATH, fs.constants.X_OK) === undefined : true,
      potreeExists: fs.existsSync(POTREE_CONVERTER_PATH),
      potreeExecutable: isLinux ? fs.accessSync(POTREE_CONVERTER_PATH, fs.constants.X_OK) === undefined : true,
      uploadsDir: fs.existsSync(UPLOAD_DIR),
      outputsDir: fs.existsSync(OUTPUT_DIR),
      potreeDir: fs.existsSync(POTREE_DIR)
    }
  };
  
  res.json(health);
});


// 파일 업로드
app.post('/api/upload-video', upload.single('video'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    console.log('File uploaded:', req.file.filename);

    res.json({
      success: true,
      message: 'File uploaded successfully',
      file: {
        filename: req.file.filename,
        originalname: req.file.originalname,
        size: req.file.size,
        path: req.file.path
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      message: 'File upload failed',
      error: error.message
    });
  }
});

// Metashape 실행 (기존 코드 유지)
app.post('/api/process-metashape', async (req, res) => {
  const { videoFilename, useUploadedFile, socketId } = req.body;

  let videoPath;
  let projectPath;
  let outputPath;

  if (useUploadedFile && videoFilename) {
    videoPath = path.join(UPLOAD_DIR, videoFilename);
    const timestamp = Date.now();
    projectPath = path.join(OUTPUT_DIR, `project_${timestamp}.psx`);
    outputPath = path.join(OUTPUT_DIR, `output_${timestamp}.laz`);
  } else {
    videoPath = req.body.videoPath || path.join(UPLOAD_DIR, 'test_video.mp4');
    const timestamp = Date.now();
    projectPath = req.body.projectPath || path.join(OUTPUT_DIR, `project_${timestamp}.psx`);
    outputPath = req.body.outputPath || path.join(OUTPUT_DIR, `output_${timestamp}.laz`);
  }

  console.log('Starting Metashape process...');
  console.log('Video path:', videoPath);
  console.log('Output path:', outputPath);
  console.log('Socket ID:', socketId);

  if (!fs.existsSync(videoPath)) {
    return res.status(400).json({
      success: false,
      message: 'Video file not found',
      videoPath: videoPath
    });
  }

  const scriptPath = path.join(__dirname, 'metashape_script.py');

  const metashapeProcess = spawn(METASHAPE_PATH, [
    '-r', scriptPath,
    videoPath,
    projectPath,
    outputPath
  ]);

  let outputData = '';
  let errorData = '';
  let responseAlreadySent = false;

  metashapeProcess.stdout.on('data', (data) => {
    const message = data.toString();
    outputData += message;
    
    // 진행률 파싱
    const lines = message.split('\n');
    lines.forEach(line => {
      if (line.startsWith('PROGRESS:')) {
        // 형식: PROGRESS:70:Building depth maps...
        const parts = line.split(':');
        if (parts.length >= 3) {
          const progress = parseInt(parts[1]);
          const text = parts.slice(2).join(':').trim();
          
          // 진행률이 유효한 범위인지 확인 (0-100)
          if (progress >= 0 && progress <= 100) {
            // WebSocket으로 진행률 전송
            if (socketId) {
              io.to(socketId).emit('metashape-progress', {
                progress: progress,
                message: text
              });
            }
            
            console.log(`[Progress] ${progress}% - ${text}`);
          }
        }
      } else if (line.trim() && !line.startsWith('PROGRESS:')) {
        console.log(`[Metashape] ${line}`);
        
        // 일반 메시지만 로그로 전송 (PROGRESS 아닌 것만)
        if (socketId && line.trim()) {
          io.to(socketId).emit('metashape-log', {
            message: line.trim()
          });
        }
      }
    });
  });

  metashapeProcess.stderr.on('data', (data) => {
    const message = data.toString();
    errorData += message;
    console.error(`[Metashape Error] ${message}`);
  });

  metashapeProcess.on('close', (code) => {
    if (responseAlreadySent) return;
    console.log(`Metashape process exited with code ${code}`);
    console.log('Output data:', outputData);
    console.log('Error data:', errorData);
    console.log('Output file exists:', fs.existsSync(outputPath));
    const lazExists = fs.existsSync(outputPath);

    if (code === 0 && lazExists ) {
      res.json({
        success: true,
        message: 'LAZ Export Complete',
        output: outputData,
        outputPath: outputPath,
        outputFilename: path.basename(outputPath)
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Metashape script failed',
        error: errorData,
        exitCode: code
      });
    }
  });

  metashapeProcess.on('error', (error) => {
    if (responseAlreadySent) return;
    console.error('Failed to start Metashape process:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start Metashape process',
      error: error.message
    });
  });
});
// Potree 변환 엔드포인트
app.post('/api/convert-to-potree', async (req, res) => {
  const { lazFilename } = req.body;

  if (!lazFilename) {
    return res.status(400).json({
      success: false,
      message: 'LAZ filename is required'
    });
  }

  const lazPath = path.join(OUTPUT_DIR, lazFilename);
  
  if (!fs.existsSync(lazPath)) {
    return res.status(400).json({
      success: false,
      message: 'LAZ file not found',
      lazPath: lazPath
    });
  }

  const timestamp = Date.now();
  const potreeOutputDir = path.join(POTREE_DIR, `potree_${timestamp}`);

  console.log('Starting Potree conversion...');
  console.log('Input LAZ:', lazPath);
  console.log('Output directory:', potreeOutputDir);

  if (!fs.existsSync(potreeOutputDir)) {
    fs.mkdirSync(potreeOutputDir, { recursive: true });
  }

  const args = [
    lazPath,
    '-o', potreeOutputDir,
    '--generate-page', 'none'
  ];

  console.log('Running command:', POTREE_CONVERTER_PATH, args.join(' '));

  const potreeProcess = spawn(POTREE_CONVERTER_PATH, args, {
    cwd: path.dirname(POTREE_CONVERTER_PATH),
    windowsHide: true
  });

  let outputData = '';
  let errorData = '';
  let hasError = false;

  potreeProcess.stdout.on('data', (data) => {
    const message = data.toString();
    outputData += message;
    console.log(`[Potree] ${message}`);
  });

  potreeProcess.stderr.on('data', (data) => {
    const message = data.toString();
    errorData += message;
    console.error(`[Potree Error] ${message}`);
  });

  potreeProcess.on('error', (error) => {
    hasError = true;
    console.error('Failed to start Potree converter:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start Potree converter',
      error: error.message,
      converterPath: POTREE_CONVERTER_PATH
    });
  });

  potreeProcess.on('close', (code) => {
    if (hasError) return;

    console.log(`Potree process exited with code ${code}`);
    
    if (code === 0) {
      let files = [];
      if (fs.existsSync(potreeOutputDir)) {
        files = fs.readdirSync(potreeOutputDir);
      }
      
      res.json({
        success: true,
        message: 'Potree conversion complete',
        output: outputData,
        outputDir: potreeOutputDir,
        files: files,
        potreeFolder: path.basename(potreeOutputDir)
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Potree conversion failed',
        error: errorData || 'Unknown error',
        output: outputData,
        exitCode: code
      });
    }
  });
});

// 결과 파일 다운로드
app.get('/api/download/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(OUTPUT_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      success: false,
      message: 'File not found'
    });
  }

  res.download(filePath);
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔧 Using Metashape: ${METASHAPE_PATH}`);
  console.log(`🔧 Using PotreeConverter: ${POTREE_CONVERTER_PATH}`);
  console.log(`📁 Upload directory: ${UPLOAD_DIR}`);
  console.log(`📁 Output directory: ${OUTPUT_DIR}`);
  console.log(`📁 Potree directory: ${POTREE_DIR}`);
  console.log(`🌐 Potree data accessible at: http://localhost:${PORT}/potree-data`);
});