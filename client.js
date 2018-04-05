require('dotenv').config({ silent: true });
const util = require('util');
const fs = require('fs');
const p = require('path');
const request = require('request');
const sanitize = require('sanitize-filename');
const gdb = require('google-drive-blobs');

const gstore = gdb({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  client_id: process.env.GOOGLE_CLIENT_ID,
  client_secret: process.env.GOOGLE_CLIENT_SECRET
});

function extractNonce(html) {
  return html.match(/name="nonce" value="(\w+)"/)[1];
}

class Client {
  constructor(format = 'webm', resolution = 720, drive = false, parent = null) {
    this.request = util.promisify(request);
    this.baseUrl = 'https://frontendmasters.com';
    this.baseUrlApi = 'https://api.frontendmasters.com';
    this.format = format;
    this.resolution = resolution;
    this.drive = drive;
    this.parent = parent;
  }

  async authenticate(username, password) {
    const form = {
      username,
      password,
      remember: 'on'
    };
    const config = this.requestConfig({
      form,
      url: 'login/',
      method: 'POST'
    });
    form.nonce = await this.getNonce();
    const { statusCode } = await this.request(config);
    return statusCode === 302;
  }

  async getNonce() {
    const config = this.requestConfig({
      url: 'login/'
    });
    const { body } = await this.request(config);
    return extractNonce(body);
  }

  requestConfig(config) {
    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/63.0.3239.132 Safari/537.36'
    };
    return {
      headers,
      baseUrl: this.baseUrl,
      jar: true,
      ...config
    };
  }

  async downloadCourseInfo(course) {
    const config = this.requestConfig({
      baseUrl: this.baseUrlApi,
      url: `v1/kabuki/courses/${course}`,
      json: true
    });
    const res = await this.request(config);
    this.courseData = res.body;
    this.lessonData = this.courseData.lessonData;
    this.downloadQueue = this.courseData.lessonHashes;
    return this.courseData;
  }

  skipLessons(qty) {
    this.downloadQueue = this.downloadQueue.slice(qty);
  }

  async downloadCourse() {
    const { downloadQueue } = this;
    const lesson = downloadQueue.shift();
    const remaining = await this.downloadLesson(lesson);
    if (remaining) return this.downloadCourse();
    return null;
  }

  async downloadLesson(lesson) {
    let url;
    let format;
    while (!url) {
      const res = await this.getVideoUrl(this.lessonData[lesson].sourceBase);
      url = res.url;
      format = res.format;
    }
    const ix = this.lessonData[lesson].index + 1;
    const filename = sanitize(
      `${ix < 10 ? '0' : ''}${ix}.${this.lessonData[lesson].title}.${format}`
    );

    const read = request({
      url,
      jar: true
    });
    const writeStream = this.writeStream(filename, read);
    let total = 0;
    read.on('data', ({ length }) => {
      process.stdout.write(
        `${filename}: ${(total += length)} bytes downloaded \r`
      );
    });
    return new Promise(resolve => {
      writeStream.on('finish', () => process.stdout.write('\n'));
      writeStream.on('finish', () => resolve(this.downloadQueue.length));
    });
  }

  async getVideoUrl(sourceBase, _resolution, _format) {
    const resolution = _resolution || this.resolution;
    const format = _format || this.format;
    const config = {
      baseUrl: sourceBase,
      url: '/source',
      qs: { r: resolution, f: format },
      json: true,
      jar: true
    };
    const res = await this.request(config);
    const { body } = res;
    return {
      resolution,
      format,
      ...body
    };
  }

  writeStream(filename, read) {
    if (this.drive)
      return read.pipe(
        gstore.createWriteStream(
          {
            filename: filename,
            parent: this.parent
          },
          function(err, res) {
            if (err) console.log(err);
          }
        )
      );
    const path = p.resolve(__dirname, 'download', this.courseData.slug);
    if (!fs.existsSync(path)) fs.mkdirSync(path);
    return read.pipe(gstore.createWriteStream(p.resolve(path, filename)));
  }
}

module.exports = Client;
