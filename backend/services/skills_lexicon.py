"""Canonical skills with the aliases recruiters and job posts use for them.

Matching is case-insensitive on word boundaries, so "React" in a job post
matches "react.js" or "ReactJS" in a CV. Keep aliases lowercase.
"""

from typing import Literal

SkillCategory = Literal["language", "framework", "data", "cloud", "devops", "ai", "practice", "soft", "tool", "domain", "certification"]

# canonical name -> (category, aliases)
SKILLS: dict[str, tuple[SkillCategory, tuple[str, ...]]] = {
    # Languages
    "Python": ("language", ("python", "python3")),
    "JavaScript": ("language", ("javascript", "js", "es6", "ecmascript")),
    "TypeScript": ("language", ("typescript", "ts")),
    "Java": ("language", ("java",)),
    "Kotlin": ("language", ("kotlin",)),
    "Swift": ("language", ("swift",)),
    "Go": ("language", ("golang", "go lang")),
    "Rust": ("language", ("rust",)),
    "C": ("language", ("c language", "ansi c")),
    "C++": ("language", ("c++", "cpp")),
    "C#": ("language", ("c#", "csharp")),
    "Ruby": ("language", ("ruby",)),
    "PHP": ("language", ("php",)),
    "Scala": ("language", ("scala",)),
    "R": ("language", ("r language", "r programming")),
    "SQL": ("language", ("sql",)),
    "Bash": ("language", ("bash", "shell scripting", "shell")),
    "HTML": ("language", ("html", "html5")),
    "CSS": ("language", ("css", "css3")),
    "Dart": ("language", ("dart",)),
    # Frameworks and libraries
    "React": ("framework", ("react", "react.js", "reactjs")),
    "Next.js": ("framework", ("next.js", "nextjs", "next js")),
    "Vue.js": ("framework", ("vue", "vue.js", "vuejs")),
    "Angular": ("framework", ("angular", "angularjs")),
    "Svelte": ("framework", ("svelte", "sveltekit")),
    "Node.js": ("framework", ("node", "node.js", "nodejs")),
    "Express.js": ("framework", ("express", "express.js", "expressjs")),
    "NestJS": ("framework", ("nestjs", "nest.js")),
    "Django": ("framework", ("django",)),
    "Flask": ("framework", ("flask",)),
    "FastAPI": ("framework", ("fastapi",)),
    "Spring Boot": ("framework", ("spring boot", "spring", "springboot")),
    "Ruby on Rails": ("framework", ("rails", "ruby on rails")),
    "Laravel": ("framework", ("laravel",)),
    ".NET": ("framework", (".net", "dotnet", "asp.net")),
    "React Native": ("framework", ("react native",)),
    "Flutter": ("framework", ("flutter",)),
    "Tailwind CSS": ("framework", ("tailwind", "tailwindcss", "tailwind css")),
    "Redux": ("framework", ("redux",)),
    "GraphQL": ("framework", ("graphql",)),
    "REST APIs": ("framework", ("rest", "restful", "rest api", "rest apis", "restful apis")),
    "gRPC": ("framework", ("grpc",)),
    "Pandas": ("framework", ("pandas",)),
    "NumPy": ("framework", ("numpy",)),
    "PyTorch": ("framework", ("pytorch",)),
    "TensorFlow": ("framework", ("tensorflow",)),
    "scikit-learn": ("framework", ("scikit-learn", "sklearn", "scikit learn")),
    "Spark": ("framework", ("spark", "apache spark", "pyspark")),
    "Prisma": ("framework", ("prisma",)),
    "Jest": ("framework", ("jest",)),
    "Cypress": ("framework", ("cypress",)),
    "Playwright": ("framework", ("playwright",)),
    "Pytest": ("framework", ("pytest",)),
    # Data stores
    "PostgreSQL": ("data", ("postgresql", "postgres", "psql")),
    "MySQL": ("data", ("mysql",)),
    "MongoDB": ("data", ("mongodb", "mongo")),
    "Redis": ("data", ("redis",)),
    "Elasticsearch": ("data", ("elasticsearch", "elastic search", "opensearch")),
    "DynamoDB": ("data", ("dynamodb",)),
    "Cassandra": ("data", ("cassandra",)),
    "SQLite": ("data", ("sqlite",)),
    "Snowflake": ("data", ("snowflake",)),
    "BigQuery": ("data", ("bigquery",)),
    "Kafka": ("data", ("kafka", "apache kafka")),
    "RabbitMQ": ("data", ("rabbitmq",)),
    "Airflow": ("data", ("airflow", "apache airflow")),
    "dbt": ("data", ("dbt",)),
    "Data Modeling": ("data", ("data modeling", "data modelling")),
    "ETL": ("data", ("etl", "elt", "data pipelines", "data pipeline")),
    # Cloud
    "AWS": ("cloud", ("aws", "amazon web services")),
    "Azure": ("cloud", ("azure", "microsoft azure")),
    "GCP": ("cloud", ("gcp", "google cloud", "google cloud platform")),
    "Lambda": ("cloud", ("lambda", "aws lambda")),
    "S3": ("cloud", ("s3",)),
    "EC2": ("cloud", ("ec2",)),
    "Serverless": ("cloud", ("serverless",)),
    "Vercel": ("cloud", ("vercel",)),
    "Firebase": ("cloud", ("firebase",)),
    "Supabase": ("cloud", ("supabase",)),
    # DevOps
    "Docker": ("devops", ("docker", "containers", "containerization")),
    "Kubernetes": ("devops", ("kubernetes", "k8s")),
    "Terraform": ("devops", ("terraform",)),
    "Ansible": ("devops", ("ansible",)),
    "CI/CD": ("devops", ("ci/cd", "ci cd", "cicd", "continuous integration", "continuous delivery", "continuous deployment")),
    "GitHub Actions": ("devops", ("github actions",)),
    "Jenkins": ("devops", ("jenkins",)),
    "Git": ("devops", ("git",)),
    "Linux": ("devops", ("linux", "unix")),
    "Nginx": ("devops", ("nginx",)),
    "Prometheus": ("devops", ("prometheus",)),
    "Grafana": ("devops", ("grafana",)),
    "Datadog": ("devops", ("datadog",)),
    "Observability": ("devops", ("observability", "application monitoring", "infrastructure monitoring", "logging and monitoring")),
    "Microservices": ("devops", ("microservices", "microservice", "service-oriented architecture")),
    "Infrastructure as Code": ("devops", ("infrastructure as code", "iac")),
    # AI
    "Machine Learning": ("ai", ("machine learning", "ml")),
    "Deep Learning": ("ai", ("deep learning",)),
    "LLMs": ("ai", ("llm", "llms", "large language models", "large language model")),
    "RAG": ("ai", ("rag", "retrieval-augmented generation", "retrieval augmented generation")),
    "Prompt Engineering": ("ai", ("prompt engineering",)),
    "NLP": ("ai", ("nlp", "natural language processing")),
    "Computer Vision": ("ai", ("computer vision",)),
    "Vector Databases": ("ai", ("vector database", "vector databases", "vector search", "pinecone", "pgvector")),
    "MLOps": ("ai", ("mlops",)),
    "LangChain": ("ai", ("langchain",)),
    # Practices
    "System Design": ("practice", ("system design", "distributed systems", "scalable systems")),
    "API Design": ("practice", ("api design", "api development")),
    "Agile": ("practice", ("agile", "scrum", "kanban")),
    "Test-Driven Development": ("practice", ("tdd", "test-driven development", "test driven development")),
    "Unit Testing": ("practice", ("unit testing", "unit tests", "automated testing", "test automation")),
    "Code Review": ("practice", ("code review", "code reviews")),
    "Security": ("practice", ("security", "application security", "owasp")),
    "Accessibility": ("practice", ("accessibility", "a11y", "wcag")),
    "Performance Optimization": ("practice", ("performance optimization", "performance tuning", "web performance")),
    "Responsive Design": ("practice", ("responsive design", "mobile-first")),
    "UX Design": ("practice", ("ux", "user experience", "ux design")),
    "Data Analysis": ("practice", ("data analysis", "analytics", "data analytics")),
    "A/B Testing": ("practice", ("a/b testing", "ab testing", "experimentation")),
    "Product Management": ("practice", ("product management", "roadmap", "product roadmap")),
    "Project Management": ("practice", ("project management",)),
    "Technical Documentation": ("practice", ("technical documentation", "technical writing", "api documentation")),
    "Incident Response": ("practice", ("incident response", "on-call", "on call")),
    # Soft skills
    "Leadership": ("soft", ("leadership", "lead a team", "led teams", "team lead")),
    "Mentoring": ("soft", ("mentoring", "mentor", "mentorship", "coaching")),
    "Communication": ("soft", ("communication", "communicator", "communication skills")),
    "Collaboration": ("soft", ("collaboration", "collaborative", "cross-functional", "cross functional")),
    "Stakeholder Management": ("soft", ("stakeholder management", "stakeholders")),
    "Problem Solving": ("soft", ("problem solving", "problem-solving")),
    "Ownership": ("soft", ("ownership", "end-to-end", "end to end")),
    # Tools
    "Figma": ("tool", ("figma",)),
    "Jira": ("tool", ("jira",)),
    "Excel": ("tool", ("excel", "microsoft excel", "spreadsheets")),
    "Tableau": ("tool", ("tableau",)),
    "Power BI": ("tool", ("power bi", "powerbi")),
    "Salesforce": ("tool", ("salesforce",)),
    "Stripe": ("tool", ("stripe",)),
    "Postman": ("tool", ("postman",)),
}

# Aliases that are also ordinary English words ("go above and beyond", "the
# rest of", "spring 2024"). They only match when capitalised like a proper
# noun or written in capitals, e.g. "Go", "REST", "Spring", "Node".
AMBIGUOUS_ALIASES = {"go", "rest", "spring", "express", "node", "lambda", "shell", "swift", "rust", "dart", "spark"}

# Healthcare, sales, finance, education, HR, operations, hospitality, legal and office
# skills live in their own module so this file stays a readable tech list.
from services.skills_professions import PROFESSION_AMBIGUOUS, PROFESSION_SKILLS  # noqa: E402

for _name, _entry in PROFESSION_SKILLS.items():
    assert _name not in SKILLS, f"duplicate skill: {_name}"
    SKILLS[_name] = _entry  # type: ignore[assignment]
AMBIGUOUS_ALIASES |= PROFESSION_AMBIGUOUS

# Skills that imply a broader one: "AWS Lambda" in a job post also asks for
# AWS, and Lambda on a CV shows AWS experience. Kept deliberately small.
IMPLIES: dict[str, str] = {
    "Lambda": "AWS",
    "S3": "AWS",
    "EC2": "AWS",
    "DynamoDB": "AWS",
    "BigQuery": "GCP",
    "GitHub Actions": "CI/CD",
    "Jenkins": "CI/CD",
}
