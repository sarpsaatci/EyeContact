test:
	forever stop server.js; git fetch origin; git pull; git checkout test; npm install; cd static; sudo bower install --allow-root; echo "bower installing"; cd ..; npm start

commit-test:
	git add .; git commit -m "commit from cloud"; git push origin; git checkout test; 

commit:
	xxx
