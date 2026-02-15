const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Utility functions
function naturalSortKey(s) {
  return String(s).split(/(\d+)/).map(part => 
    isNaN(part) ? part.toLowerCase() : parseInt(part)
  );
}

function cleanMetadata(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    return value.length > 0 ? cleanMetadata(value[0]) : "";
  }
  let s = String(value);
  if (s.includes(",")) s = s.split(",")[0];
  s = s.replace(/^\[['"]/, "").replace(/['"]\]$/, "");
  return s.trim();
}

function cleanFilename(name) {
  if (!name) return "";
  const invalidChars = '<>:"/\\|?*';
  let cleaned = name;
  for (const char of invalidChars) {
    cleaned = cleaned.replace(new RegExp(char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '');
  }
  return cleaned.replace(/\s+/g, ' ').trim();
}

function getMetadataValue(data, keyNames) {
  if (typeof keyNames === 'string') keyNames = [keyNames];
  
  for (const key of keyNames) {
    if (data[key] !== null && data[key] !== undefined) {
      return cleanMetadata(data[key]);
    }
  }
  
  const meta = data.metadata || {};
  for (const key of keyNames) {
    if (meta[key] !== null && meta[key] !== undefined) {
      return cleanMetadata(meta[key]);
    }
  }
  
  return "";
}

async function findMetadataFiles(dir, results = []) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        await findMetadataFiles(fullPath, results);
      } else if (entry.name === 'metadata.json') {
        results.push(fullPath);
      }
    }
  } catch (err) {
    console.error(`Error reading directory ${dir}:`, err.message);
  }
  
  return results;
}

async function getFileSize(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return stats.size;
  } catch {
    return 0;
  }
}

// API Routes
app.post('/api/scan', async (req, res) => {
  const { libraryPath, formatConfig } = req.body;
  
  if (!libraryPath) {
    return res.status(400).json({ error: 'Library path is required' });
  }

  try {
    // Verify path exists
    await fs.access(libraryPath);
    
    console.log(`Scanning library at: ${libraryPath}`);
    const metadataFiles = await findMetadataFiles(libraryPath);
    console.log(`Found ${metadataFiles.length} metadata files`);

    const stats = {
      books: 0,
      authors: new Set(),
      narrators: new Set(),
      series: new Set(),
      totalSize: 0,
      totalDuration: 0,
      standaloneCount: 0
    };

    const plannedMoves = [];
    const audioExtensions = new Set(['.mp3', '.m4b', '.m4a', '.flac', '.ogg', '.opus', '.aac']);

    for (const metaPath of metadataFiles) {
      try {
        const content = await fs.readFile(metaPath, 'utf-8');
        const data = JSON.parse(content);

        stats.books++;
        
        const author = getMetadataValue(data, ['authorName', 'author', 'authors', 'bookAuthor']) || "Unknown Author";
        const bookTitle = getMetadataValue(data, ['title', 'bookTitle']) || "Unknown Title";
        const narrator = getMetadataValue(data, ['narratorName', 'narrator', 'narrators']) || "Unknown Narrator";
        const seriesField = getMetadataValue(data, ['seriesName', 'series']) || "";
        const durationRaw = data.duration || (data.metadata && data.metadata.duration) || 0;

        stats.authors.add(author);
        if (narrator !== "Unknown Narrator") stats.narrators.add(narrator);

        let seriesTitle = "";
        let bookNumber = "";

        if (seriesField) {
          if (seriesField.includes("#")) {
            const parts = seriesField.split("#");
            seriesTitle = cleanFilename(parts[0]);
            const rawNum = parts[1].trim();
            if (rawNum.includes(".")) {
              const nParts = rawNum.split(".");
              bookNumber = `${nParts[0].padStart(2, '0')}.${nParts[1]}`;
            } else if (!isNaN(rawNum)) {
              bookNumber = rawNum.padStart(2, '0');
            } else {
              bookNumber = rawNum;
            }
            stats.series.add(seriesTitle);
          } else {
            seriesTitle = cleanFilename(seriesField);
            stats.series.add(seriesTitle);
          }
        } else {
          stats.standaloneCount++;
        }

        stats.totalDuration += parseFloat(durationRaw) || 0;

        const cleanAuthor = cleanFilename(author);
        const cleanTitle = cleanFilename(bookTitle);

        // Build target path
        let targetPath;
        if (formatConfig.folderFormat === 'author-series-book' && seriesTitle) {
          const folderLabel = bookNumber ? `${bookNumber} ${cleanTitle}` : cleanTitle;
          targetPath = path.join(libraryPath, cleanAuthor, seriesTitle, folderLabel);
        } else {
          targetPath = path.join(libraryPath, cleanAuthor, cleanTitle);
        }

        const bookDir = path.dirname(metaPath);
        const allFiles = await fs.readdir(bookDir);
        
        // Get file sizes
        for (const file of allFiles) {
          const filePath = path.join(bookDir, file);
          stats.totalSize += await getFileSize(filePath);
        }

        // Filter audio files
        const audioFiles = allFiles
          .filter(f => audioExtensions.has(path.extname(f).toLowerCase()))
          .sort((a, b) => {
            const aKey = naturalSortKey(a);
            const bKey = naturalSortKey(b);
            return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
          });

        const movePlan = [];
        const numAudio = audioFiles.length;

        // Build file names
        audioFiles.forEach((audioFile, i) => {
          let newName;
          if (formatConfig.fileFormat === 'full-details') {
            const nameParts = [cleanAuthor];
            if (seriesTitle) {
              nameParts.push(`${seriesTitle} ${bookNumber}`.trim());
            }
            nameParts.push(cleanTitle);
            const baseName = nameParts.filter(p => p).join(" - ");
            const ext = path.extname(audioFile);
            newName = `${baseName}${numAudio > 1 ? ' - ' + String(i + 1).padStart(2, '0') : ''}${ext}`;
          } else if (formatConfig.fileFormat === 'title-only') {
            const ext = path.extname(audioFile);
            newName = `${cleanTitle}${numAudio > 1 ? ' - ' + String(i + 1).padStart(2, '0') : ''}${ext}`;
          } else {
            newName = audioFile;
          }

          movePlan.push({
            oldName: audioFile,
            newName: cleanFilename(newName),
            oldPath: path.join(bookDir, audioFile),
            type: 'audio'
          });
        });

        // Add other files
        allFiles.forEach(f => {
          if (!audioFiles.includes(f)) {
            movePlan.push({
              oldName: f,
              newName: f,
              oldPath: path.join(bookDir, f),
              type: 'other'
            });
          }
        });

        // Check if changes needed
        const hasChanges = (bookDir !== targetPath) || 
                          movePlan.some(m => m.oldName !== m.newName);

        if (hasChanges) {
          plannedMoves.push({
            title: bookTitle,
            author: author,
            oldPath: path.relative(libraryPath, bookDir),
            newPath: path.relative(libraryPath, targetPath),
            movePlan: movePlan,
            bookDir: bookDir,
            targetDir: targetPath
          });
        }
      } catch (err) {
        console.error(`Error processing ${metaPath}:`, err.message);
      }
    }

    res.json({
      stats: {
        books: stats.books,
        authors: stats.authors.size,
        narrators: stats.narrators.size,
        series: stats.series.size,
        standalone: stats.standaloneCount,
        totalDuration: stats.totalDuration,
        totalSize: stats.totalSize
      },
      plannedMoves: plannedMoves
    });

  } catch (err) {
    console.error('Scan error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/execute', async (req, res) => {
  const { plannedMoves } = req.body;
  
  if (!plannedMoves || !Array.isArray(plannedMoves)) {
    return res.status(400).json({ error: 'Planned moves required' });
  }

  const results = {
    applied: 0,
    errors: 0,
    collisions: []
  };

  try {
    for (const book of plannedMoves) {
      try {
        // Create target directory
        await fs.mkdir(book.targetDir, { recursive: true });

        // Move files
        for (const fileMove of book.movePlan) {
          try {
            const newPath = path.join(book.targetDir, fileMove.newName);
            
            // Check if already exists
            if (fileMove.oldPath === newPath) {
              continue;
            }

            try {
              await fs.access(newPath);
              results.collisions.push(fileMove.newName);
              continue;
            } catch {
              // File doesn't exist, good to move
            }

            await fs.rename(fileMove.oldPath, newPath);
          } catch (err) {
            console.error(`Error moving file ${fileMove.oldName}:`, err.message);
            results.errors++;
          }
        }

        // Try to remove old directory if empty
        try {
          const remaining = await fs.readdir(book.bookDir);
          if (remaining.length === 0) {
            await fs.rmdir(book.bookDir);
          }
        } catch {
          // Ignore errors when removing directory
        }

        results.applied++;
      } catch (err) {
        console.error(`Error processing book ${book.title}:`, err.message);
        results.errors++;
      }
    }

    res.json(results);
  } catch (err) {
    console.error('Execute error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Audiobookshelf Tidy Server running on port ${PORT}`);
  console.log(`Access at http://localhost:${PORT}`);
});
