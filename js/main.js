// Get all the projects
$(document).ready(function () {
    $.get('/project/get', function (data) {
        data.forEach(item => {
            $('#projects-menu').append(
                `<a class="dropdown-item" href="/project?id=${item.id}">${item.name}</a>`
            )
        })
    });

    $.get('/blog/get', function (data) {
        data.forEach(item => {
            $('#blog-menu').append(
                `<a class="dropdown-item" href="/blog?category=${item.category}">${item.category}</a>`
            )
        })
    });

    $('#em').html('<a href="mailto:admin@phg1024.net">admin@phg1024.net</a>');
});
