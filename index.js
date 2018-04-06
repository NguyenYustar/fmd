#! /usr/bin/env node
const args = require('args');
const FrontendMasters = require('./client');

args
  .option('user', 'Username or Email')
  .option('pass', 'Password')
  .option(
    'course',
    'Slug for the course download (ex.: javascript-hard-parts for https://frontendmasters.com/courses/javascript-hard-parts/'
  )
  .option(
    'skip',
    'Number of videos to skip (ex.: 5, would start download on video number 6',
    0
  )
  .option('format', 'webm or mp4', 'webm')
  .option('resolution', '720 or 1080', 1080)
  .option('drive', 'Save to Google Drive')
  .option(
    'parent',
    'Drive folder ID, if not specify, it will upload to the root'
  );

const userOptions = args.parse(process.argv);
async function run(options) {
  const {
    format,
    resolution,
    user,
    pass,
    course,
    skip,
    drive,
    parent
  } = options;
  const client = new FrontendMasters(format, resolution, drive, parent);
  const authed = await client.authenticate(user, pass);
  if (authed) {
    console.log(`${user} Logged in.`);
    const data = await client.downloadCourseInfo(course);
    console.log(`"${data.title}" course info downloaded`);
    client.skipLessons(skip);
    console.log(`Downloading ${client.downloadQueue.length} videos`);
    await client.downloadCourse();
  } else {
    console.log('Authentication failed');
  }
}

run(userOptions);
