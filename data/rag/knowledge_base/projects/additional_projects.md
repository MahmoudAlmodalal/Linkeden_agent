# Project Dossiers: Additional Engineering Systems

## 1. Noor Al-Huda (نور الهدى)
- **Domain**: Offline-First Quran Center Platform
- **Scale**: 300+ students, automated PDF report cards, family messaging
- **Tech Stack**: Next.js, TypeScript, Dexie.js (IndexedDB), Django REST Framework, PostgreSQL
- **Key Challenge & Solution**:
  - Unstable and intermittent internet connectivity in classroom settings.
  - Built an offline-first architecture using Dexie.js to store memorization logs and presence directly in browser IndexedDB.
  - Implemented bidirectional reconciliation when network reconnects, preventing data loss and eliminating instructor friction.

---

## 2. OK FBI
- **Domain**: Interactive Role-Based Investigation Platform
- **Tech Stack**: FastAPI, MongoDB, React, Pytest
- **Key Challenge & Solution**:
  - High-concurrency state handling during team sessions and streamer live play.
  - Hardened backend security, implemented automated integration testing with Pytest, and optimized MongoDB query indexing for rapid case clue resolution.

---

## 3. Human Tracking & Face Recognition
- **Domain**: Real-time Computer Vision Pipeline
- **Tech Stack**: Python, YOLOv8, DeepSort, InsightFace, PyTorch, OpenCV
- **Key Challenge & Solution**:
  - Processing continuous video streams with face detection, multi-person tracking, and identity matching without dropping frames.
  - Built an asynchronous frame pipeline separating YOLO object detection from DeepSort spatial tracking and InsightFace feature vector extraction, turning visual movement into structured analytics.

---

## 4. MyShell (Unix Process Shell in C)
- **Domain**: Low-Level Systems Programming
- **Tech Stack**: C, POSIX APIs, Linux Process Control
- **Key Challenge & Solution**:
  - Deep exploration of operating system internals: process creation (`fork`), program execution (`execvp`), signal handling (`SIGINT`, `SIGCHLD`), file descriptor redirection (`dup2`), pipelines (`pipe`), and background process tracking.
  - Implemented robust zombie process reaping and batch command script parsing without memory leaks.

---

## 5. Doc-sorter
- **Domain**: File System Automation & Document Classification
- **Tech Stack**: Python, OS file libraries
- **Key Challenge & Solution**:
  - Classifying unstructured folders containing thousands of PDFs, DOCXs, and spreadsheets recursively.
  - Designed metadata-driven classification rules that sort and organize chaotic directories deterministically with zero data corruption.

---

## 6. Leadership & Engineering Roles
- **Technical Manager at Washer (Saudi Arabia)**: Coordinating engineering priorities, architecture design, and delivery across partner integrations.
- **Teaching Assistant at Islamic University of Gaza**: Laboratory instructor for Computer Engineering courses (Data Structures, Algorithms, Computer Architecture, Digital Logic Design).
- **Training Operations Manager & Instructor at MET Academy**: Delivering technical training in computer engineering, system architecture, and programming.
