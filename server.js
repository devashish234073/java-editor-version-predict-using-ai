const express = require('express');
const http = require('http');
const path = require('path');
const { exec } = require('child_process');
const fs = require("fs");

models = [];
function populateModels() {
  exec('ollama list', (error, stdout, stderr) => {
    if (error) {
      console.error(`Error executing command: ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`Error: ${stderr}`);
      return;
    }
    const lines = stdout.split('\n');
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line) {
        const parts = line.split(/\s+/);
        const modelName = parts[0];
        models.push(modelName);
      }
    }
    console.log("available models ", models);
  });
}
if (process.argv[2]) {
  models.push(process.argv[2]);
  console.log("overriding with only one model ", models);
} else {
  populateModels();
}

const app = express();
const PORT = 9999;

let registeredJdks = {};

app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

app.get('/models', (req, res) => {
  res.end(JSON.stringify(models));
});

app.get('/getRegisteredJdks', (req, res) => {
  res.end(JSON.stringify(registeredJdks));
});

app.post('/registerJdk', (req, res) => {
  const jdkVersion = req.body.jdkVersion;
  const jdkPath = req.body.jdkPath;
  registeredJdks[jdkVersion] = jdkPath;
  res.end("done");
});

app.post('/runAgainstJdk', (req, res) => {
  let code = req.body.code;
  const version = req.body.version;
  let codeObj = processCode(code);
  if (registeredJdks[version]) {
    let filePath = "public/" + codeObj.className + ".java"
    fs.writeFile(filePath, codeObj.code, (error) => {
      let obj = {};
      let jdkPath = registeredJdks[version];
      if(jdkPath.indexOf("/bin")==-1) {
        jdkPath = jdkPath + "/bin";
      }
      exec("\""+jdkPath+'/javac\" '+filePath, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error executing command: ${error.message}`);
          obj["error"] = error.message;
          res.end(JSON.stringify(obj));
          return;
        }
        if (stderr) {
          console.error(`Error: ${stderr}`);
          obj["error"] = stderr;
          res.end(JSON.stringify(obj));
          return;
        }
        obj["javacStdout"] = stdout;
        filePath = codeObj.className;//class file path
        exec("\""+jdkPath+'/java\" '+filePath,{cwd: 'public'}, (error, stdout, stderr) => {
          if (error) {
            console.error(`Error executing command: ${error.message}`);
            obj["error"] = error.message;
            res.end(JSON.stringify(obj));
            return;
          }
          if (stderr) {
            console.error(`Error: ${stderr}`);
            obj["error"] = stderr;
            res.end(JSON.stringify(obj));
            return;
          }
          console.log("stdout",stdout);
          obj["output"] = stdout;
          res.end(JSON.stringify(obj));
        });
      });
    });
  } else {
    res.end(JSON.stringify({ "error": "jdk version " + version + " not registered" }));
  }
});

function processCode(code) {
  const packageRegex = /(package\s+[a-zA-Z_][a-zA-Z0-9_.]*\s*;)/;
  const classRegex = /class\s+([A-Za-z_][A-Za-z0-9_]*)\s*{/;
  const packageMatch = code.match(packageRegex);
  const packageDeclaration = packageMatch ? packageMatch[1] : null;
  if (packageDeclaration) {
    code = code.replace(packageDeclaration, "");
  }
  const classMatch = code.match(classRegex);
  const className = classMatch ? classMatch[1] : null;
  if (!className) {
    className = "TestClass";
    code = "public class TestClass {" + code + "}";
  }
  return { "code": code, "className": className };
}

app.post('/runAgainstAI', (req, res) => {
  const code = req.body.code;
  const version = req.body.jdkVersion;
  const MODEL = req.body.model;
  const postData = JSON.stringify({
    model: MODEL,
    prompt: `Guess the output when this java code runs against java ${version} compiler, do not provide any explanation, just the output of this ` + code
  });

  const options = {
    hostname: 'localhost',
    port: 11434,
    path: '/api/generate',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const apiReq = http.request(options, (apiRes) => {
    res.setHeader('Content-Type', 'text/plain');

    apiRes.on('data', (chunk) => {
      res.write(chunk);
    });

    apiRes.on('end', () => {
      res.end();
    });
  });

  apiReq.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
    res.status(500).send('Internal Server Error');
  });

  apiReq.write(postData);
  apiReq.end();
});

app.post('/predictJavaVersion', (req, res) => {
  const code = req.body.code;
  const MODEL = req.body.model;
  const postData = JSON.stringify({
    model: MODEL,
    prompt: " what is the minimum version of java required to run this code reply only in json with the version required and description keys, in the description give the reason why that version is required " + code
  });

  const options = {
    hostname: 'localhost',
    port: 11434,
    path: '/api/generate',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const apiReq = http.request(options, (apiRes) => {
    res.setHeader('Content-Type', 'text/plain');

    apiRes.on('data', (chunk) => {
      res.write(chunk);
    });

    apiRes.on('end', () => {
      res.end();
    });
  });

  apiReq.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
    res.status(500).send('Internal Server Error');
  });

  apiReq.write(postData);
  apiReq.end();
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
