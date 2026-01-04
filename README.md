<div align="center">
  
# 📄 RenderCV

### _Professional CV Generator for Academics & Engineers_

[![test](https://github.com/rendercv/rendercv/actions/workflows/test.yaml/badge.svg?branch=main)](https://github.com/rendercv/rendercv/actions/workflows/test.yaml)
[![coverage](https://coverage-badge.samuelcolvin.workers.dev/rendercv/rendercv.svg)](https://coverage-badge.samuelcolvin.workers.dev/redirect/rendercv/rendercv)
[![docs](https://img.shields.io/badge/docs-mkdocs-rgb(0%2C79%2C144))](https://docs.rendercv.com)
[![pypi-version](https://img.shields.io/pypi/v/rendercv?label=PyPI%20version&color=rgb(0%2C79%2C144))](https://pypi.python.org/pypi/rendercv)
[![pypi-downloads](https://img.shields.io/pepy/dt/rendercv?label=PyPI%20downloads&color=rgb(0%2C%2079%2C%20144))](https://pypistats.org/packages/rendercv)

---

🌐 **Live Demo:** [purecvfrontend-production.up.railway.app](https://purecvfrontend-production.up.railway.app)

🔧 **API Endpoint:** [pure-cv-builder-production.up.railway.app](https://pure-cv-builder-production.up.railway.app)

</div>

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🎯 **YAML-Powered** | Write your CV as structured YAML - no more fighting with Word templates |
| 📊 **Version Control** | Track every change with Git - your CV is just text |
| 🎨 **5 Professional Themes** | Classic, ModernCV, Academic, Tech, Entry Level |
| ⚡ **Real-time Preview** | Instant PDF preview as you type |
| 🤖 **AI-Powered Suggestions** | Smart content recommendations for headlines & summaries |
| 📈 **ATS Score Calculator** | Optimize your CV for Applicant Tracking Systems |
| 🌍 **Multi-Language Support** | Localization for any language |
| 🔧 **Extensive Customization** | Control colors, fonts, margins, and typography |

---

## 🖥️ Web Application

Our modern web editor provides a seamless CV building experience:

### 🎨 Theme Gallery
Choose from 5 professionally designed themes optimized for different career stages:

| Theme | Best For |
|-------|----------|
| **Classic** | Traditional professional roles |
| **ModernCV** | Modern two-column design |
| **Academic** | Research & academic careers |
| **Tech** | Engineering & tech focused |
| **Entry Level** | Students & new graduates |

### 🛠️ Editor Features
- **Live Preview** - See changes instantly
- **Section Navigation** - Easy organization (Profile, Experience, Education, Skills, Projects, Publications, Awards)
- **Drag & Drop Reordering** - Customize section priority
- **Photo Upload** - Optional profile photo support
- **Export to PDF** - One-click download

---

## 📦 CLI Installation

Install RenderCV (Requires Python 3.12+):

```bash
pip install "rendercv[full]"
```

Create a new CV:

```bash
rendercv new "John Doe"
```

Render your CV:

```bash
rendercv render "John_Doe_CV.yaml"
```

---

## 📝 YAML Structure

```yaml
cv:
  name: John Doe
  location: San Francisco, CA
  email: john.doe@email.com
  website: https://example.com
  social_networks:
    - network: LinkedIn
      username: johndoe
    - network: GitHub
      username: johndoe
  sections:
    education:
      - institution: Stanford University
        area: Computer Science
        degree: PhD
        start_date: 2018-09
        end_date: 2023-05
        location: Stanford, CA
        highlights:
          - "Thesis: Machine Learning for Computer Vision"
          - "Advisor: Prof. Fei-Fei Li"
    experience:
      - company: Google
        position: Senior Software Engineer
        start_date: 2023-06
        end_date: present
        location: Mountain View, CA
        highlights:
          - Led development of core ML infrastructure
          - Improved model inference by 40%
```

---

## 🎨 Design Customization

```yaml
design:
  theme: classic
  page:
    size: us-letter
    top_margin: 0.7in
    bottom_margin: 0.7in
    left_margin: 0.7in
    right_margin: 0.7in
  colors:
    name: rgb(0, 79, 144)
    section_titles: rgb(0, 79, 144)
    links: rgb(0, 79, 144)
  typography:
    font_family: Source Sans 3
    line_spacing: 0.6em
    alignment: justified
```

---

## 🏗️ Architecture

```
rendercv/
├── src/              # Core RenderCV Python library
├── web/
│   ├── frontend/     # Next.js 15 web application
│   │   └── src/
│   │       └── app/
│   │           ├── page.tsx        # Landing page
│   │           └── editor/         # CV Editor
│   └── backend/      # FastAPI REST API
│       ├── main.py   # API entry point
│       └── api/      # Route handlers
├── docs/             # Documentation
├── examples/         # Sample CVs
└── tests/            # Test suite
```

---

## 🚀 Deployment

### Frontend (Next.js)
- **Platform:** Railway
- **URL:** [purecvfrontend-production.up.railway.app](https://purecvfrontend-production.up.railway.app)

### Backend (FastAPI)
- **Platform:** Railway
- **URL:** [pure-cv-builder-production.up.railway.app](https://pure-cv-builder-production.up.railway.app)
- **Health Check:** `/health`

### Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Backend API URL (frontend) |
| `CORS_ORIGINS` | Allowed origins (backend) |
| `LOG_LEVEL` | Logging level (backend) |

---

## 📚 Documentation

- 📖 [User Guide](https://docs.rendercv.com/user_guide/)
- 🔧 [VS Code Setup](https://docs.rendercv.com/user_guide/how_to/set_up_vs_code_for_rendercv)
- 📋 [JSON Schema Reference](https://docs.rendercv.com)

---

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<div align="center">
  
**[🌐 Try it Now](https://purecvfrontend-production.up.railway.app)** | **[📖 Documentation](https://docs.rendercv.com)** | **[⭐ Star on GitHub](https://github.com/rendercv/rendercv)**

Made with ❤️ for professionals who value their time

</div>
